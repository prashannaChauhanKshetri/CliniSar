"""Tests for medicines/, medicines/<id>/batches/, stock-movements/ and batches/."""

import datetime

import pytest
from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.tests.factories import DoctorProfileFactory, UserFactory
from apps.pharmacy import services
from apps.pharmacy.models import Medicine, MedicineBatch
from apps.pharmacy.tests.factories import MedicineFactory

MEDICINES = "/api/v1/medicines/"
BATCHES = "/api/v1/batches/"
Role = User.Role
pytestmark = pytest.mark.django_db


def in_days(days: int) -> str:
    return (timezone.localdate() + datetime.timedelta(days=days)).isoformat()


@pytest.fixture
def pharmacist() -> User:
    return UserFactory(role=Role.PHARMACIST)


def stock(medicine, pharmacist, batch_number, quantity, expires_in) -> MedicineBatch:
    """Put a batch into stock. Past expiry dates are made directly (a purchase refuses them)."""
    if expires_in > 0:
        return services.record_purchase(
            medicine,
            batch_number=batch_number,
            expiry_date=timezone.localdate() + datetime.timedelta(days=expires_in),
            quantity=quantity,
            user=pharmacist,
        )
    batch = MedicineBatch.objects.create(
        clinic=medicine.clinic,
        medicine=medicine,
        batch_number=batch_number,
        expiry_date=timezone.localdate() + datetime.timedelta(days=expires_in),
        quantity=0,
    )
    services.change_stock(batch, change=quantity, reason="PURCHASE", note="x", user=pharmacist)
    return batch


# ---------- medicines ----------


def test_pharmacist_creates_a_medicine_with_zero_stock(login_as, pharmacist) -> None:
    response = login_as(pharmacist).post(
        MEDICINES,
        {
            "name": "Amoxicillin",
            "strength": "500mg",
            "form": "Capsule",
            "unit_price": "12.00",
            "reorder_level": 20,
        },
    )
    assert response.status_code == 201
    assert response.data["available_stock"] == 0
    assert response.data["is_low_stock"] is True
    assert Medicine.objects.get(id=response.data["id"]).clinic == pharmacist.clinic


def test_stock_cannot_be_written_on_a_medicine(login_as, pharmacist) -> None:
    medicine = MedicineFactory(clinic=pharmacist.clinic)
    login_as(pharmacist).patch(f"{MEDICINES}{medicine.id}/", {"available_stock": 999})
    response = login_as(pharmacist).get(f"{MEDICINES}{medicine.id}/")
    assert response.data["available_stock"] == 0


def test_list_shows_available_stock_without_expired_batches(login_as, pharmacist) -> None:
    medicine = MedicineFactory(clinic=pharmacist.clinic, reorder_level=10)
    stock(medicine, pharmacist, "GOOD", 25, expires_in=100)
    stock(medicine, pharmacist, "OLD", 40, expires_in=-3)

    row = login_as(pharmacist).get(MEDICINES).data["results"][0]

    assert row["available_stock"] == 25
    assert row["is_low_stock"] is False


def test_low_stock_filter(login_as, pharmacist) -> None:
    low = MedicineFactory(clinic=pharmacist.clinic, name="Low", reorder_level=10)
    stock(low, pharmacist, "L-1", 10, expires_in=100)  # exactly at the reorder level
    plenty = MedicineFactory(clinic=pharmacist.clinic, name="Plenty", reorder_level=10)
    stock(plenty, pharmacist, "P-1", 11, expires_in=100)
    client = login_as(pharmacist)

    names = [row["name"] for row in client.get(MEDICINES, {"low_stock": "true"}).data["results"]]
    others = [row["name"] for row in client.get(MEDICINES, {"low_stock": "false"}).data["results"]]

    assert names == ["Low"]
    assert others == ["Plenty"]


def test_same_name_and_strength_twice_is_refused(login_as, pharmacist) -> None:
    MedicineFactory(clinic=pharmacist.clinic, name="Cetirizine", strength="10mg")
    response = login_as(pharmacist).post(
        MEDICINES, {"name": "cetirizine", "strength": "10MG", "unit_price": "3.00"}
    )
    assert response.status_code == 400


def test_medicine_with_batches_cannot_be_deleted(login_as, pharmacist) -> None:
    medicine = MedicineFactory(clinic=pharmacist.clinic)
    stock(medicine, pharmacist, "B-1", 5, expires_in=100)
    assert login_as(pharmacist).delete(f"{MEDICINES}{medicine.id}/").status_code == 409


def test_doctor_can_read_medicines_but_not_change_them(login_as) -> None:
    doctor = DoctorProfileFactory()
    medicine = MedicineFactory(clinic=doctor.user.clinic)
    client = login_as(doctor.user)

    assert client.get(MEDICINES).status_code == 200
    assert client.patch(f"{MEDICINES}{medicine.id}/", {"unit_price": "1.00"}).status_code == 403
    assert client.get(f"{MEDICINES}{medicine.id}/batches/").status_code == 403


def test_lab_cannot_use_the_pharmacy(login_as) -> None:
    client = login_as(UserFactory(role=Role.LAB_TECHNICIAN))
    assert client.get(MEDICINES).status_code == 403
    assert client.get(BATCHES).status_code == 403


def test_front_desk_runs_the_pharmacy_too(login_as) -> None:
    """In a small clinic the front desk also hands out medicines and buys stock."""
    staff = UserFactory(role=Role.STAFF)
    client = login_as(staff)
    created = client.post(MEDICINES, {"name": "ORS", "unit_price": "20.00"})
    assert created.status_code == 201
    assert client.get(BATCHES).status_code == 200
    assert client.get(f"{MEDICINES}{created.data['id']}/batches/").status_code == 200


def test_admin_manages_the_pharmacy(login_as) -> None:
    admin = UserFactory(role=Role.CLINIC_ADMIN)
    response = login_as(admin).post(MEDICINES, {"name": "ORS", "unit_price": "20.00"})
    assert response.status_code == 201


# ---------- purchase through the API ----------


def test_purchase_adds_a_batch(login_as, pharmacist) -> None:
    medicine = MedicineFactory(clinic=pharmacist.clinic)
    client = login_as(pharmacist)

    response = client.post(
        f"{MEDICINES}{medicine.id}/batches/",
        {"batch_number": "B-100", "expiry_date": in_days(365), "quantity": 200},
    )

    assert response.status_code == 201
    assert response.data["quantity"] == 200
    assert response.data["expiry_status"] == "OK"
    listed = client.get(f"{MEDICINES}{medicine.id}/batches/").data["results"]
    assert [row["batch_number"] for row in listed] == ["B-100"]
    assert client.get(f"{MEDICINES}{medicine.id}/").data["available_stock"] == 200


@pytest.mark.parametrize(
    ("data", "field"),
    [
        ({"batch_number": "X", "expiry_date": in_days(0), "quantity": 5}, "expiry_date"),
        ({"batch_number": "X", "expiry_date": in_days(30), "quantity": 0}, "quantity"),
        ({"expiry_date": in_days(30), "quantity": 5}, "batch_number"),
    ],
)
def test_invalid_purchase_is_refused(login_as, pharmacist, data, field) -> None:
    medicine = MedicineFactory(clinic=pharmacist.clinic)
    response = login_as(pharmacist).post(f"{MEDICINES}{medicine.id}/batches/", data)
    assert response.status_code == 400
    assert field in response.data


# ---------- batches/ ----------


def test_expiring_and_expired_filters(login_as, pharmacist) -> None:
    medicine = MedicineFactory(clinic=pharmacist.clinic)
    stock(medicine, pharmacist, "SOON", 5, expires_in=20)
    stock(medicine, pharmacist, "LATER", 5, expires_in=200)
    stock(medicine, pharmacist, "EXPIRED", 5, expires_in=-1)
    empty_expired = stock(medicine, pharmacist, "EMPTY-OLD", 5, expires_in=-2)
    services.adjust_stock(empty_expired, change=-5, note="Written off", user=pharmacist)
    client = login_as(pharmacist)

    def numbers(query) -> list[str]:
        rows = client.get(BATCHES, query).data["results"]
        return sorted(row["batch_number"] for row in rows)

    assert numbers({"expiring_within": 90}) == ["SOON"]
    assert numbers({"expired": "true"}) == ["EXPIRED"]  # empty batches are left out
    statuses = {
        row["batch_number"]: row["expiry_status"] for row in client.get(BATCHES).data["results"]
    }
    assert statuses == {
        "SOON": "EXPIRING_SOON",
        "LATER": "OK",
        "EXPIRED": "EXPIRED",
        "EMPTY-OLD": "EXPIRED",
    }


def test_adjust_endpoint(login_as, pharmacist) -> None:
    batch = stock(MedicineFactory(clinic=pharmacist.clinic), pharmacist, "B-1", 10, 100)
    client = login_as(pharmacist)

    ok = client.post(f"{BATCHES}{batch.id}/adjust/", {"change": -3, "note": "Broken bottles"})
    too_much = client.post(f"{BATCHES}{batch.id}/adjust/", {"change": -8, "note": "x"})
    no_note = client.post(f"{BATCHES}{batch.id}/adjust/", {"change": -1})

    assert (ok.status_code, ok.data["quantity"]) == (200, 7)
    assert too_much.status_code == 400
    assert no_note.status_code == 400


def test_batches_cannot_be_created_or_edited_directly(login_as, pharmacist) -> None:
    batch = stock(MedicineFactory(clinic=pharmacist.clinic), pharmacist, "B-1", 10, 100)
    client = login_as(pharmacist)
    assert client.post(BATCHES, {}).status_code == 405
    assert client.patch(f"{BATCHES}{batch.id}/", {"quantity": 999}).status_code == 405
    assert client.delete(f"{BATCHES}{batch.id}/").status_code == 405


def test_stock_movements_show_the_history(login_as, pharmacist) -> None:
    medicine = MedicineFactory(clinic=pharmacist.clinic)
    batch = stock(medicine, pharmacist, "B-1", 10, 100)
    services.adjust_stock(batch, change=-2, note="Count", user=pharmacist)

    rows = login_as(pharmacist).get(f"{MEDICINES}{medicine.id}/stock-movements/").data["results"]

    assert [(row["reason"], row["change"]) for row in rows] == [
        ("ADJUSTMENT", -2),
        ("PURCHASE", 10),
    ]
    assert rows[0]["created_by_name"] == pharmacist.get_full_name()
