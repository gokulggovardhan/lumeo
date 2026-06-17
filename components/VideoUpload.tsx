'use client';
import { useState } from 'react';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

interface Props {
  projectId: string;
  existingUrl?: string;
}

export default function VideoUpload({ projectId, existingUrl }: Props) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState(existingUrl || '');
  const [error, setError] = useState('');

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size — max 100MB for free plan
    if (file.size > 100 * 1024 * 1024) {
      setError('File too large. Maximum 100MB allowed.');
      return;
    }

    setUploading(true);
    setProgress(20);
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      setProgress(40);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      setProgress(80);

      const data = await res.json();

      if (data.url) {
        setVideoUrl(data.url);
        setProgress(100);

        // Save to Firestore
        await updateDoc(doc(db, 'projects', projectId), {
          videoUrl: data.url,
          videoPublicId: data.publicId,
          videoDuration: data.duration,
          updatedAt: new Date(),
        });

      } else {
        setError('Upload failed. Please try again.');
      }

    } catch (err) {
      console.error(err);
      setError('Something went wrong. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '16px',
      padding: '24px',
    }}>
      <h3 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: 600 }}>
        Project Video
      </h3>

      {!videoUrl ? (
        <label style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px',
          border: '2px dashed rgba(167,139,250,0.3)',
          borderRadius: '12px',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}>
          <input
            type="file"
            accept="video/mp4,video/mov,video/avi,video/webm"
            onChange={handleUpload}
            style={{ display: 'none' }}
            disabled={uploading}
          />

          {uploading ? (
            <div style={{ textAlign: 'center', width: '100%' }}>
              <p style={{ marginBottom: '12px', color: '#A78BFA' }}>
                Uploading... {progress}%
              </p>
              <div style={{
                height: '6px',
                background: 'rgba(255,255,255,0.08)',
                borderRadius: '99px',
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${progress}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #7C3AED, #A78BFA)',
                  borderRadius: '99px',
                  transition: 'width 0.3s ease',
                }} />
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '36px', marginBottom: '12px' }}>📁</div>
              <p style={{ fontWeight: 600, marginBottom: '4px' }}>
                Click to upload video
              </p>
              <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>
                MP4, MOV, AVI, WebM — Max 100MB
              </span>
            </div>
          )}
        </label>
      ) : (
        <div>
          <video
            src={videoUrl}
            controls
            style={{
              width: '100%',
              borderRadius: '12px',
              background: '#000',
              marginBottom: '12px',
            }}
          />
          <label style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            background: 'rgba(124,58,237,0.2)',
            border: '1px solid rgba(124,58,237,0.3)',
            borderRadius: '99px',
            cursor: 'pointer',
            fontSize: '13px',
            color: '#A78BFA',
          }}>
            <input
              type="file"
              accept="video/*"
              onChange={handleUpload}
              style={{ display: 'none' }}
            />
            Replace video
          </label>
        </div>
      )}

      {error && (
        <p style={{ marginTop: '12px', color: '#F87171', fontSize: '13px' }}>
          ⚠️ {error}
        </p>
      )}
    </div>
  );
}