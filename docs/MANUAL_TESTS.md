# Manual test checklist

Automated tests cover the rules (about 610 back-end and 120 front-end tests). This list
is for a person clicking through the real app: before a demo, before going live, and
(the short part at the end) after each production release.

**Setup (local)**: `python manage.py seed_demo` in `backend/`, then start the back end
and the front end (README). Every demo password is `demo-pass-123`. Logins for the
first clinic, Sunrise Health Clinic:

| Role | Login |
| ---- | ----- |
| Clinic admin | `admin@sunrise.demo` |
| Front desk & pharmacy | `staff@sunrise.demo` |
| Doctor | `dr.anil@sunrise.demo` (`dr.sunita@` sees the returning patient Krishna) |
| Lab technician | `lab@sunrise.demo` |

The second clinic, Himal Care Clinic, uses the same names with `@himal.demo`.

Tick each box; note anything odd with the date, the login and what you clicked.

## 1. Sign-in and session

- [ ] Wrong password shows "Incorrect email or password." (no hint which one was wrong).
- [ ] Six wrong attempts within a minute: the sixth says "Too many attempts. Please wait a minute".
- [ ] Correct login opens the dashboard for that role.
- [ ] Reload the page: still signed in (the cookie refreshes the session).
- [ ] Sign out, then press Back: the login page shows, not the previous screen.
- [ ] Leave the tab for 20 minutes, then click something: it still works (silent refresh).

## 2. Roles see only their part

For each login, compare the sidebar with this table and try opening a hidden page by
typing its address (for example `/staff` as the front desk): it must show the "not for
your role" page, never the page itself.

| Role | Sees |
| ---- | ---- |
| Clinic admin | Everything, including Staff, Departments, Settings |
| Front desk & pharmacy | Appointments, Patients, Prescriptions, Documents, Medicines, Expiry, Lab orders, Invoices, Doctors |
| Doctor | Appointments, My schedule, Patients, Prescriptions, Documents, Lab orders |
| Lab technician | Lab orders, Lab tests, Invoices (lab bills only) |

## 3. Clinics never see each other

- [ ] As `staff@sunrise.demo`, open a patient and copy the address bar.
- [ ] Sign in as `staff@himal.demo`, paste the address: "not found". Search the same
      name: no result.

## 4. Patients

- [ ] Register a patient with only an age (no date of birth, no phone): saved, the age
      shows correctly.
- [ ] Register "hari / GURUNG" without phone: the form lists the existing Hari Gurung
      and asks; "This is the patient" opens his record.
- [ ] Same name with his phone (`9800000003`), then "Register as a new patient": refused,
      "Use Hari Gurung" offered.
- [ ] Delete a patient who has visits: refused with a clear message.

## 5. Appointments and the queue

- [ ] Book a slot: only free slots are offered; a consultation bill is created.
- [ ] Two browsers book the same slot at the same time: one succeeds, the other is told
      the slot was just taken.
- [ ] Add two walk-ins: they get #1 and #2 in the doctor's queue column.
- [ ] As the doctor: the dashboard shows the next patient; "Seen" moves to the next.
- [ ] Cancel a visit with a reason: it leaves the queue.

## 6. Prescriptions and pharmacy

- [ ] As the doctor, write a prescription from a visit.
- [ ] As the front desk & pharmacy (and again as the admin): the dispensing counter
      shows it with stock per medicine.
- [ ] A medicine with too little stock shows "short by N" and Dispense stays disabled.
- [ ] Dispense: stock goes down from the batch that expires first; a pharmacy bill
      appears; "Take payment" opens it.
- [ ] Add a medicine: the "Record purchase" dialog opens straight after; the stock shows.
- [ ] Adjust a batch with a reason: the change appears in Stock history.
- [ ] Expiry page: expired batches can be written off; they are never dispensed.

## 7. Lab

- [ ] As the lab technician: New lab order -> New patient registers someone who came on
      their own; the order gets a Lab No. and a lab bill.
- [ ] The front desk sees "1 patient from the lab to check"; "Details checked" clears it.
- [ ] Sample collected -> enter results (every row required) -> Completed -> Print shows
      the report with parameter rows and ranges.

## 8. Bills and printing

- [ ] Pay a bill with a discount: totals and VAT (Sunrise: 13% on pharmacy) are right.
- [ ] A paid bill cannot be changed or cancelled.
- [ ] Change VAT in Settings, then open an old bill: it is unchanged.
- [ ] Print the A4 bill, the thermal receipt, a prescription and a lab report:
      Bikram Sambat dates, "Rs. 1,25,000.00" style amounts, clinic letterhead, one page, and the small black CliniSar logo at the end.

## 8b. Money rules and returning patients (phase 12)

- [ ] The front desk's dashboard shows no earnings; the admin's shows "Earned today".
- [ ] As the front desk, cancel an unpaid bill with a reason: it says "waiting for the
      admin to review", with your name and the time.
- [ ] As the admin: the bell says "1 bill was cancelled by the front desk"; the bills list
      switch "Cancelled by the front desk, to review" shows it; "Seen" clears it.
- [ ] An old `pharmacist@...` login (if your database had one) still signs in, as
      "Front desk & pharmacy".
- [ ] As `dr.sunita@sunrise.demo`, open Krishna Bhandari: History shows the visits, the
      last prescription and a Random Blood Sugar chart (210 -> 185 -> 162) with dashed
      normal lines; the queue shows "7th visit" style badges.
- [ ] The lab technician opening a patient sees no History card.

## 9. Uploads

- [ ] Upload a PDF and a JPG to a patient's documents: both open.
- [ ] Upload a renamed `.exe` (or any file over 10 MB): refused with a clear message.
- [ ] (Production) Copy a document's link, wait 6 minutes, open it: refused (the link
      lasts 5 minutes).

## 10. Screens and usability

- [ ] Phone width (390 px): the sidebar becomes a menu button; tables scroll inside
      their card; dialogs fit.
- [ ] Every list shows a loading state, an empty state and, with the back end stopped,
      an error with "Try again".
- [ ] Keyboard only: Tab reaches every button; Enter submits forms; Esc closes dialogs.

## 11. Production only (after going live)

- [ ] `http://api.clinic.example` and `http://app.clinic.example` redirect to `https://`.
- [ ] `curl -sI https://api.clinic.example/api/v1/auth/me/` shows
      `strict-transport-security`, `x-content-type-options: nosniff`,
      `x-frame-options: DENY`.
- [ ] `curl -sI https://app.clinic.example` shows `content-security-policy` and
      `strict-transport-security`.
- [ ] The browser console on the app shows no "Refused to ..." (CSP) errors.
- [ ] Find one of your own requests in CloudWatch by its id (docs/DEPLOY.md, step 13).
- [ ] `https://api.clinic.example/admin/`: the super admin can sign in; several wrong
      passwords in quick succession soon get "429 Too Many Requests" from nginx.

## After every production release (5 minutes)

- [ ] GitHub Actions: all four jobs green.
- [ ] Sign in as a clinic admin; the dashboard loads.
- [ ] Open a patient, a prescription and a bill.
- [ ] Reload the page: still signed in.
- [ ] CloudWatch: no new `5xx` lines since the release.
