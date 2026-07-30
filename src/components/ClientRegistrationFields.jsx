import { CountryPhoneInput } from './CountryPhoneInput'

/**
 * Shared client / lead registration fields (admin clients page + public contact form).
 * Pass showNotes={false} when the host page has its own request / notes field.
 */
export function ClientRegistrationFields({ form, setForm, fieldClass, showNotes = true }) {
  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
            First name *
          </span>
          <input
            required
            className={fieldClass}
            value={form.first_name}
            onChange={(e) => setField('first_name', e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
            Middle name
          </span>
          <input
            className={fieldClass}
            value={form.middle_name}
            onChange={(e) => setField('middle_name', e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
            Surname *
          </span>
          <input
            required
            className={fieldClass}
            value={form.surname}
            onChange={(e) => setField('surname', e.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block w-fit shrink-0">
          <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
            Gender / sex
          </span>
          <select
            className={`${fieldClass} w-[4.5rem] min-w-0 px-2`}
            value={form.gender}
            onChange={(e) => setField('gender', e.target.value)}
          >
            <option value="">—</option>
            <option value="M">M</option>
            <option value="F">F</option>
          </select>
        </label>
        <label className="block min-w-0 flex-1">
          <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
            ID / Passport number *
          </span>
          <input
            required
            className={fieldClass}
            value={form.id_number}
            onChange={(e) => setField('id_number', e.target.value)}
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2 lg:col-span-3">
          <CountryPhoneInput
            required
            country={form.country}
            phone={form.cellphone}
            onChange={({ country, phone }) =>
              setForm((f) => ({ ...f, country, cellphone: phone }))
            }
          />
        </div>

        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
            Email *
          </span>
          <input
            required
            type="email"
            className={fieldClass}
            value={form.email}
            onChange={(e) => setField('email', e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
            Landline
          </span>
          <input
            className={fieldClass}
            value={form.landline}
            onChange={(e) => setField('landline', e.target.value)}
          />
        </label>
        <label className="block sm:col-span-2 lg:col-span-3">
          <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
            Postal address
          </span>
          <input
            className={fieldClass}
            value={form.postal_address}
            onChange={(e) => setField('postal_address', e.target.value)}
          />
        </label>
        <label className="block sm:col-span-2 lg:col-span-3">
          <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">
            Physical address
          </span>
          <input
            className={fieldClass}
            value={form.physical_address}
            onChange={(e) => setField('physical_address', e.target.value)}
          />
        </label>
        {showNotes ? (
          <label className="block sm:col-span-2 lg:col-span-3">
            <span className="mb-1 block text-xs uppercase tracking-wider text-ink-400">Notes</span>
            <textarea
              rows={2}
              className={`${fieldClass} resize-y`}
              value={form.notes}
              onChange={(e) => setField('notes', e.target.value)}
            />
          </label>
        ) : null}
      </div>
    </div>
  )
}
