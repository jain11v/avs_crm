import api from '../api/axios';

// Uploads several files to the same entity, one request per file — used
// right after creating a task, to attach the documents picked in
// AssignTaskModal to the new task's id.
export async function uploadFiles(files, entityType, entityId) {
  for (const file of files) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('entity_type', entityType);
    formData.append('entity_id', entityId);
    await api.post('/documents', formData);
  }
}
