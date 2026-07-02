'use client';

import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api/adminClient';

interface Tag {
  id: string;
  name: string;
}

export default function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [newName, setNewName] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchTags = async () => {
    try {
      const data = await adminApi<any>('/tags');
      const tagArray = Array.isArray(data)
        ? data
        : data?.rows ?? data?.items ?? data?.data ?? [];
      setTags(tagArray);
    } catch {
      setTags([]);
    }
  };

  useEffect(() => {
    fetchTags();
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await adminApi('/tags', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim() }),
      });
      setNewName('');
      fetchTags();
    } catch (err) {
      setError('Failed to create tag');
    }
  };

  const handleRename = async (id: string, name: string) => {
    try {
      await adminApi(`/tags/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      });
      setEditId(null);
      fetchTags();
    } catch (err) {
      setError('Failed to rename tag');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this tag? It will be removed from all products.')) return;
    try {
      await adminApi(`/tags/${id}`, { method: 'DELETE' });
      fetchTags();
    } catch (err) {
      setError('Failed to delete tag');
    }
  };

  return (
    <div className="mx-auto max-w-lg p-6 bg-gray-50 min-h-screen">
      <h1 className="heading-page text-base">Manage Tags</h1>
      {error && (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}
      <div className="flex gap-2 mb-4 mt-4">
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="New tag"
          className="form-input flex-1"
        />
        <button onClick={handleCreate} className="btn-primary">
          Add
        </button>
      </div>
      <ul className="space-y-2">
        {tags.map(t => (
          <li
            key={t.id}
            className="card !p-3 flex items-center justify-between"
          >
            {editId === t.id ? (
              <>
                <input
                  autoFocus
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="form-input flex-1 mr-2"
                />
                <button
                  onClick={() => handleRename(t.id, editName)}
                  className="text-sm font-medium text-emerald-600 hover:text-emerald-800 mr-2"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditId(null)}
                  className="text-sm text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span className="text-sm text-slate-700">{t.name}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditId(t.id);
                      setEditName(t.name);
                    }}
                    className="btn-link"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="btn-link text-rose-600 hover:text-rose-800"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}