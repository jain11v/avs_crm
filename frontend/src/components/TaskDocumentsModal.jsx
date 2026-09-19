import DocumentsPanel from './DocumentsPanel';

// Read-through into a task's attached documents — reuses DocumentsPanel
// as-is (entity_type='task'), so uploading more files here works the same
// way it does everywhere else documents are attached.
export default function TaskDocumentsModal({ open, task, onClose }) {
  if (!open || !task) return null;

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{task.title}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          {task.description && <p className="subtitle" style={{ marginTop: 0 }}>{task.description}</p>}
          <DocumentsPanel entityType="task" entityId={task.id} title="Documents" />
        </div>
      </div>
    </div>
  );
}
