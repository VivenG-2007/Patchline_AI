'use client';

import { useRef, useState } from 'react';
import { UploadCloud, CheckCircle2 } from 'lucide-react';
import ProtectedShell from '@/components/ProtectedShell';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';
import { aiApi, filesApi } from '@/lib/api';

export default function UploadPage() {
  const [prompt, setPrompt] = useState('');
  const [reply, setReply] = useState<string | null>(null);
  const [chatting, setChatting] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastUpload, setLastUpload] = useState<{ originalName: string; sizeBytes: number } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const onChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    setChatting(true);
    setChatError(null);
    setReply(null);
    try {
      const { data } = await aiApi.chat({ messages: [{ role: 'user', content: prompt }] });
      setReply(data.content);
    } catch (err: any) {
      setChatError(
        err?.response?.data?.error?.message ||
          'AI request failed — check that ai-storage-service is running and reachable from main-service.'
      );
    } finally {
      setChatting(false);
    }
  };

  const onUpload = async () => {
    const file = fileInput.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const { data } = await filesApi.upload(file);
      setLastUpload({ originalName: data.file.originalName, sizeBytes: data.file.sizeBytes });
    } catch (err: any) {
      setUploadError(
        err?.response?.data?.error?.message ||
          'Upload failed — check that AZURE_STORAGE_CONNECTION_STRING is set on ai-storage-service.'
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <ProtectedShell>
      <PageHeader
        eyebrow="ai-storage-service"
        title="AI & files"
        description="Both calls travel through main-service's gateway, which forwards your token to ai-storage-service for independent verification."
      />

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-5">
          <h2 className="text-xs text-muted uppercase tracking-widest mb-4 font-mono">Chat</h2>
          <form onSubmit={onChat} className="space-y-3">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder="Ask the configured AI provider something…"
              className="w-full bg-canvas border border-border rounded-md px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:border-accent outline-none resize-none transition-colors"
            />
            <Button type="submit" disabled={chatting}>
              {chatting ? 'Thinking…' : 'Send'}
            </Button>
          </form>
          {chatError && <Alert className="mt-3">{chatError}</Alert>}
          {reply && (
            <div className="mt-4 bg-canvas border border-border rounded-lg px-4 py-3 text-sm text-ink/90 whitespace-pre-wrap leading-relaxed">
              {reply}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-xs text-muted uppercase tracking-widest mb-4 font-mono">File upload</h2>
          <label className="flex flex-col items-center justify-center gap-2 border border-dashed border-border rounded-lg py-8 cursor-pointer hover:border-accent transition-colors">
            <UploadCloud size={20} strokeWidth={1.5} className="text-muted" />
            <span className="text-xs text-muted">Choose a file to store in Azure Blob</span>
            <input ref={fileInput} type="file" className="hidden" />
          </label>
          <Button onClick={onUpload} disabled={uploading} className="mt-4 w-full">
            {uploading ? 'Uploading…' : 'Upload'}
          </Button>
          {uploadError && <Alert className="mt-3">{uploadError}</Alert>}
          {lastUpload && (
            <div className="mt-4 flex items-center gap-2 text-sm text-success">
              <CheckCircle2 size={15} />
              Stored {lastUpload.originalName} ({(lastUpload.sizeBytes / 1024).toFixed(1)} KB)
            </div>
          )}
        </Card>
      </div>
    </ProtectedShell>
  );
}
