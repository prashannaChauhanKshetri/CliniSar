/** Upload a scan or report for a patient: PDF, JPG or PNG, up to 10 MB. */
import { FileInput, TextInput } from '@mantine/core'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { documentsApi, patientsApi } from '../../api/resources'
import { FormModal } from '../../components/FormModal'
import { RemoteSelect } from '../../components/RemoteSelect'
import { showServerFieldErrors } from '../../lib/forms'
import { notifyError, notifySuccess } from '../../lib/notify'

const MAX_BYTES = 10 * 1024 * 1024

interface UploadValues {
  patient: string | null
  title: string
  file: File | null
}

export function UploadDocumentModal({
  patient,
  onClose,
}: {
  /** Fixed patient (from the patient page), or null to choose one. */
  patient: { id: string; name: string } | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const form = useForm<UploadValues>({
    defaultValues: { patient: patient?.id ?? null, title: '', file: null },
  })
  const errors = form.formState.errors
  const upload = useMutation({
    mutationFn: (values: UploadValues) =>
      documentsApi.upload({
        patient: values.patient!,
        title: values.title.trim(),
        file: values.file!,
      }),
    onSuccess: (document) => {
      notifySuccess(`"${document.title}" was added to ${document.patient_name}'s documents.`)
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
      onClose()
    },
    onError: (error) =>
      showServerFieldErrors(error, form.setError, ['patient', 'title', 'file']) ||
      notifyError(error),
  })

  return (
    <FormModal
      opened
      onClose={onClose}
      size="md"
      title="Upload document"
      submitLabel="Upload"
      submitting={upload.isPending}
      onSubmit={form.handleSubmit((values) => upload.mutate(values))}
    >
      {!patient && (
        <Controller
          control={form.control}
          name="patient"
          rules={{ required: 'Choose the patient.' }}
          render={({ field }) => (
            <RemoteSelect
              label="Patient"
              required
              placeholder="Type a name or phone"
              queryKey="patients"
              fetchOptions={async (search) =>
                (await patientsApi.list({ search, page_size: 20 })).results.map((p) => ({
                  value: p.id,
                  label: `${p.full_name}${p.phone ? ` · ${p.phone}` : ''}`,
                }))
              }
              value={field.value}
              onChange={(value) => field.onChange(value)}
              error={errors.patient?.message}
            />
          )}
        />
      )}
      <TextInput
        label="Title"
        placeholder="e.g. Old X-ray report"
        required
        data-autofocus
        error={errors.title?.message}
        {...form.register('title', { required: 'Give the document a title.' })}
      />
      <Controller
        control={form.control}
        name="file"
        rules={{
          required: 'Choose a file.',
          validate: (file) => !file || file.size <= MAX_BYTES || 'The file is larger than 10 MB.',
        }}
        render={({ field }) => (
          <FileInput
            label="File"
            description="PDF, JPG or PNG, up to 10 MB."
            accept="application/pdf,image/jpeg,image/png"
            leftSection={<Upload size={16} />}
            required
            clearable
            error={errors.file?.message}
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
    </FormModal>
  )
}
