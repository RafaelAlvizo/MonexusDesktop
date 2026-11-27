const extensions = {
  jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp', gif:'image/gif',
  bmp:'image/bmp', avif:'image/avif', svg:'image/svg+xml', ico:'image/x-icon',
  mp4:'video/mp4', m4v:'video/mp4', webm:'video/webm', mov:'video/quicktime', ogv:'video/ogg',
  mp3:'audio/mpeg', m4a:'audio/mp4', wav:'audio/wav', ogg:'audio/ogg', opus:'audio/ogg', flac:'audio/flac', aac:'audio/aac',
  pdf:'application/pdf',
};
export function attachmentType(file) {
  const ext = (file.name || '').split('.').pop().toLowerCase();
  const stored = String(file.mime || file.type || file.contentType || '').split(';')[0].trim().toLowerCase();
  const mime = /^(image|audio|video)\//.test(stored) || stored === 'application/pdf' ? stored : extensions[ext] || stored;
  const kind = mime?.split('/')[0];
  if (['image','audio','video'].includes(kind)) return { kind, mime };
  if (mime === 'application/pdf') return { kind:'pdf', mime };
  if (['docx','pptx','xlsx','odt','odp','ods'].includes(ext)) return { kind:'office', ext };
  if (stored.startsWith('text/') || ['txt','csv','tsv','md','json','xml','yaml','yml','log','html','css','js'].includes(ext))
    return { kind:'text' };
  return { kind:'other' };
}
