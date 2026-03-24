export function PillTypeForm({ pillForm, setPillForm, onSubmit, isLocked }) {
  return (
    <form className="card" onSubmit={onSubmit}>
      <h3>Add Pill Type</h3>
      <input required value={pillForm.code} onChange={(e) => setPillForm((p) => ({ ...p, code: e.target.value }))} placeholder="Code" />
      <input required value={pillForm.name} onChange={(e) => setPillForm((p) => ({ ...p, name: e.target.value }))} placeholder="Name" />
      <input value={pillForm.dosageMg} onChange={(e) => setPillForm((p) => ({ ...p, dosageMg: e.target.value }))} placeholder="Dosage (mg)" />
      <input value={pillForm.manufacturer} onChange={(e) => setPillForm((p) => ({ ...p, manufacturer: e.target.value }))} placeholder="Manufacturer" />
      <button disabled={isLocked}>Save Pill Type</button>
    </form>
  );
}
