from pathlib import Path
import re

p = Path('client/src/pages/Home.tsx')
s = p.read_text(encoding='utf-8')

# Synchronous lock so duplicate selections cannot start a second upload before React re-renders.
anchor = "  const paymentProofUploadRequestRef = useRef(0);\n"
replacement = anchor + "  const paymentProofUploadBusyRef = useRef(false);\n"
if s.count(anchor) != 1:
    raise SystemExit(f'busy ref anchor count={s.count(anchor)}')
s = s.replace(anchor, replacement, 1)

# Replace only the payment-proof uploader. The shared reliable uploader already compresses images,
# so Home must not compress the same image a second time before sending it.
pattern = re.compile(r"  const uploadPaymentProof = async \(selectedFile: File\) => \{.*?\n  \};\n\n  const handlePaymentProofSelect", re.S)
match = pattern.search(s)
if not match:
    raise SystemExit('uploadPaymentProof block not found')
new_block = '''  const uploadPaymentProof = async (selectedFile: File) => {
    if (paymentProofUploadBusyRef.current) return;
    paymentProofUploadBusyRef.current = true;
    const requestId = ++paymentProofUploadRequestRef.current;
    setPaymentProofUploadError('');
    // "uploading" is shown immediately. The shared reliable uploader handles the single compression pass.
    setPaymentProofUploadState('uploading');
    setRestoredFileUrls(prev => ({ ...prev, paymentProof: undefined }));
    removeUploadedFileUrl('paymentProof');
    setPaymentProof(selectedFile);

    const isPdf = selectedFile.type === 'application/pdf' || /\\.pdf$/i.test(selectedFile.name);
    if (isPdf) {
      setPaymentProofPreview('pdf');
    } else {
      try {
        setPaymentProofPreview(prev => {
          if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
          return URL.createObjectURL(selectedFile);
        });
      } catch {
        setPaymentProofPreview('');
      }
    }

    try {
      const phone = clientPhone.trim() || 'temp';
      const result = await uploadFileToServer(selectedFile, 'comprovante-pix', phone);
      if (requestId !== paymentProofUploadRequestRef.current) return;

      if (!result) {
        setPaymentProofUploadState('failed');
        setPaymentProofUploadError('O arquivo foi selecionado, mas ainda não foi enviado. Toque em “Tentar enviar novamente”.');
        return;
      }
      saveUploadedFileUrl('paymentProof', result.url, result.mimeType);
      setRestoredFileUrls(prev => ({ ...prev, paymentProof: result.url }));
      setPaymentProofUploadState('uploaded');
    } catch {
      if (requestId !== paymentProofUploadRequestRef.current) return;
      setPaymentProofUploadState('failed');
      setPaymentProofUploadError('Não foi possível concluir o envio. Tente novamente.');
    } finally {
      if (requestId === paymentProofUploadRequestRef.current) paymentProofUploadBusyRef.current = false;
    }
  };

  const handlePaymentProofSelect'''
s = s[:match.start()] + new_block + s[match.end():]

# Retry must also respect the synchronous lock.
old = "  const retryPaymentProofUpload = () => {\n    if (paymentProof) void uploadPaymentProof(paymentProof);\n  };"
new = "  const retryPaymentProofUpload = () => {\n    if (!paymentProofUploadBusyRef.current && paymentProof) void uploadPaymentProof(paymentProof);\n  };"
if s.count(old) != 1:
    raise SystemExit(f'retry anchor count={s.count(old)}')
s = s.replace(old, new, 1)

# File-picker handler ignores any second selection while an upload is already active.
old = "  const handlePaymentProofSelect = (e: React.ChangeEvent<HTMLInputElement>) => {\n    const file = e.target.files?.[0];"
new = "  const handlePaymentProofSelect = (e: React.ChangeEvent<HTMLInputElement>) => {\n    if (paymentProofUploadBusyRef.current) { e.target.value = ''; return; }\n    const file = e.target.files?.[0];"
if s.count(old) != 1:
    raise SystemExit(f'handler anchor count={s.count(old)}')
s = s.replace(old, new, 1)

# Removing the proof also releases any stale synchronous lock and blob preview.
old = "paymentProofUploadRequestRef.current++; setPaymentProof(null); setPaymentProofPreview(null); setPaymentProofUploadState('idle');"
new = "paymentProofUploadRequestRef.current++; paymentProofUploadBusyRef.current = false; if (paymentProofPreview?.startsWith('blob:')) URL.revokeObjectURL(paymentProofPreview); setPaymentProof(null); setPaymentProofPreview(null); setPaymentProofUploadState('idle');"
if s.count(old) != 1:
    raise SystemExit(f'remove button anchor count={s.count(old)}')
s = s.replace(old, new, 1)

p.write_text(s, encoding='utf-8')
