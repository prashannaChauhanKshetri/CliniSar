/**
 * The one way screens give feedback after an action, so every success and failure
 * looks the same everywhere (golden rules 1 and 3: consistency, informative feedback).
 */
import { notifications } from '@mantine/notifications'
import { getErrorMessage } from '../api/errors'

export function notifySuccess(message: string, title = 'Done'): void {
  notifications.show({ title, message, color: 'success', autoClose: 4000 })
}

export function notifyError(error: unknown, title = 'That did not work'): void {
  notifications.show({ title, message: getErrorMessage(error), color: 'danger', autoClose: 8000 })
}
