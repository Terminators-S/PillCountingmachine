export function RecordForm({ recordForm, setRecordForm, pillTypes, onSubmit, isLocked }) {
  return (
    <form className="card" onSubmit={onSubmit}>
      <h3>Record Count</h3>
      <input
        required
        value={recordForm.machineId}
        onChange={(event) => setRecordForm((prev) => ({ ...prev, machineId: event.target.value }))}
        placeholder="Machine ID"
      />
      <select
        required
        value={recordForm.pillTypeCode}
        onChange={(event) => setRecordForm((prev) => ({ ...prev, pillTypeCode: event.target.value }))}
      >
        <option value="">Select pill type</option>
        {pillTypes.map((pillType) => (
          <option key={pillType.code} value={pillType.code}>{pillType.code} - {pillType.name}</option>
        ))}
      </select>
      <input
        required
        type="number"
        min="0"
        value={recordForm.quantity}
        onChange={(event) => setRecordForm((prev) => ({ ...prev, quantity: event.target.value }))}
        placeholder="Quantity"
      />
      <div className="row">
        <input
          value={recordForm.lotNo}
          onChange={(event) => setRecordForm((prev) => ({ ...prev, lotNo: event.target.value }))}
          placeholder="Lot no (optional)"
        />
        <input
          type="date"
          value={recordForm.expiryDate}
          onChange={(event) => setRecordForm((prev) => ({ ...prev, expiryDate: event.target.value }))}
          placeholder="Expiry date"
        />
      </div>
      <div className="row">
        <input
          value={recordForm.location}
          onChange={(event) => setRecordForm((prev) => ({ ...prev, location: event.target.value }))}
          placeholder="Location (optional)"
        />
        <input
          value={recordForm.operatorId}
          onChange={(event) => setRecordForm((prev) => ({ ...prev, operatorId: event.target.value }))}
          placeholder="Operator ID (optional)"
        />
      </div>
      <button disabled={isLocked}>Save Record</button>
    </form>
  );
}
