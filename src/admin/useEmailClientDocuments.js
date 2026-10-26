import { useCallback, useState } from 'react'
import { documentRecipients, formatRecipientList } from '../lib/clientEmails'
import { todayIso } from '../lib/dateRange'
import {
  buildClientDocumentsEmail,
  remindMonthLabel,
  safePdfFilename,
} from '../lib/invoiceRemind'
import { formatPula } from '../lib/money'
import { opsApi } from '../lib/opsApi'
import { htmlPrintToPdfBase64 } from '../lib/printHtmlToPdf'
import { prepareStatementDocument } from '../lib/statementDocument'
import { useOpsAlert } from './OpsAlertContext'

/**
 * Email the print-ready invoice PDF, the statement PDF, or both.
 * The statement ends on the invoice date and starts at most one year earlier,
 * or at the client's first transaction when that is more recent.
 */
export function useEmailClientDocuments() {
  const { confirm, showError, showSuccess, beginProgress, endProgress } = useOpsAlert()
  const [busy, setBusy] = useState(false)

  const emailClientDocuments = useCallback(
    async (invoiceId, clientId) => {
      if (!invoiceId || busy) return
      setBusy(true)
      try {
        const preview = await opsApi.getBillingDocumentBundle('invoice', invoiceId)
        if (preview.error) {
          showError(preview.error.message)
          return
        }
        const { model, printPageHtml } = preview.data
        const recipients = documentRecipients(model.client)
        if (!recipients.length) {
          showError('This client has no email address on file. Update the client record first.')
          return
        }

        const choice = await confirm({
          title: 'Email documents to client?',
          message: `A copy will be sent to ${formatRecipientList(recipients)}.`,
          confirmLabel: 'Send email',
          choices: [
            { id: 'invoice', label: 'Invoice', checked: true },
            {
              id: 'statement',
              label: 'Statement',
              hint: 'Up to this invoice’s date, back at most one year or to the client’s first transaction.',
              checked: true,
            },
          ],
        })
        if (!choice?.invoice && !choice?.statement) return

        beginProgress({
          title: 'Sending email…',
          total: 1,
          current: 1,
          label: model.client.name || 'Client',
        })

        const attachments = []
        let periodLabel = ''
        let totalLabel = ''

        if (choice.invoice) {
          const invoicePdf = await htmlPrintToPdfBase64(printPageHtml)
          attachments.push({
            filename: `${safePdfFilename(model.docNumber || 'Invoice')}.pdf`,
            content: invoicePdf,
          })
        }

        if (choice.statement) {
          if (!clientId) throw new Error('This invoice has no client.')
          const to = String(model.issueDate || '').slice(0, 10) || todayIso()
          const settingsRes = await opsApi.getSettings()
          if (settingsRes.error) throw new Error(settingsRes.error.message)
          const stmtRes = await opsApi.getClientStatement({
            client_id: clientId,
            to,
            capYears: 1,
          })
          if (stmtRes.error) throw new Error(stmtRes.error.message)
          const printable = {
            ...stmtRes.data,
            lines: (stmtRes.data.lines || []).filter((line) => !line.inactive || line.alwaysShow),
          }
          const { model: stmtModel, printPageHtml: stmtHtml } = prepareStatementDocument({
            statement: printable,
            settings: settingsRes.data,
          })
          periodLabel = `${stmtModel.fromFormatted} to ${stmtModel.toFormatted}`
          totalLabel = formatPula(stmtModel.closingBalance)
          const statementPdf = await htmlPrintToPdfBase64(stmtHtml)
          attachments.push({
            filename: `${safePdfFilename(
              `Statement ${stmtModel.from || ''} to ${stmtModel.to || ''}`.trim(),
            )}.pdf`,
            content: statementPdf,
          })
        }

        const monthLabel = remindMonthLabel({ issue_date: model.issueDate })
        const { subject, html, text } = buildClientDocumentsEmail({
          clientName: model.client.name || 'Client',
          includeInvoice: Boolean(choice.invoice),
          includeStatement: Boolean(choice.statement),
          monthLabel,
          totalLabel,
          periodLabel,
          docNumber: model.docNumber && model.docNumber !== 'Draft' ? model.docNumber : '',
        })

        const sendRes = await opsApi.sendInvoiceRemindEmail({
          to: recipients,
          subject,
          html,
          text,
          attachments,
        })
        if (sendRes.error) throw new Error(sendRes.error.message)
        showSuccess(`Email sent to ${formatRecipientList(recipients)}.`)
      } catch (err) {
        showError(err?.message || 'Could not send the email.')
      } finally {
        endProgress()
        setBusy(false)
      }
    },
    [busy, confirm, showError, showSuccess, beginProgress, endProgress],
  )

  return { emailClientDocuments, emailDocumentsBusy: busy }
}
