<script>
  import { onDestroy } from 'svelte';

  // Props: onCapture(file) — file đã nén (capture.jpg), parent tự upload qua endpoint hiện có
  let { onCapture } = $props();

  let previewUrl = $state('');
  let capturedFile = $state(null);
  let cameraOn = $state(false);
  let cameraError = $state('');
  let busy = $state(false);
  let videoEl = $state(null);
  let stream = $state(null);
  let fileInput = $state(null);

  const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

  function compressToJpeg(source, sw, sh) {
    return new Promise((resolve, reject) => {
      try {
        const maxEdge = 1600;
        const scale = Math.min(1, maxEdge / Math.max(sw, sh));
        const w = Math.round(sw * scale);
        const h = Math.round(sh * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(source, 0, 0, w, h);
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('compress failed'));
          resolve(new File([blob], 'capture.jpg', { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.8);
      } catch (e) { reject(e); }
    });
  }

  function fileToImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve({ img, url });
      img.onerror = reject;
      img.src = url;
    });
  }

  async function handleFileInput(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    busy = true;
    cameraError = '';
    try {
      const { img, url } = await fileToImage(file);
      const compressed = await compressToJpeg(img, img.naturalWidth, img.naturalHeight);
      URL.revokeObjectURL(url);
      capturedFile = compressed;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(compressed);
    } catch {
      cameraError = 'Không đọc được ảnh. Hãy thử lại.';
    } finally {
      busy = false;
    }
  }

  async function openCamera() {
    cameraError = '';
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraError = 'Trình duyệt không hỗ trợ camera. Hãy chọn file ảnh.';
      fileInput?.click();
      return;
    }
    try {
      stopStream();
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      cameraOn = true;
      // gán stream sau khi video render
      requestAnimationFrame(() => { if (videoEl && stream) videoEl.srcObject = stream; });
    } catch {
      cameraError = 'Không mở được camera (bị từ chối hoặc không có camera). Hãy chọn file ảnh.';
      fileInput?.click();
    }
  }

  async function snapPhoto() {
    if (!videoEl || !stream) return;
    busy = true;
    try {
      const vw = videoEl.videoWidth || 1280;
      const vh = videoEl.videoHeight || 720;
      capturedFile = await compressToJpeg(videoEl, vw, vh);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(capturedFile);
      stopStream();
      cameraOn = false;
    } catch {
      cameraError = 'Chụp ảnh thất bại. Hãy thử lại.';
    } finally {
      busy = false;
    }
  }

  function stopStream() {
    try { stream?.getTracks()?.forEach((t) => t.stop()); } catch {}
    stream = null;
  }

  function retake() {
    capturedFile = null;
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = ''; }
    if (isMobile) fileInput?.click();
    else openCamera();
  }

  function confirm() {
    if (capturedFile && onCapture) onCapture(capturedFile);
  }

  onDestroy(() => {
    stopStream();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  });
</script>

<div class="camera-capture">
  {#if !previewUrl && !cameraOn}
    <div class="camera-start">
      {#if isMobile}
        <button type="button" class="btn-main" disabled={busy} on:click={() => fileInput?.click()}>📷 {busy ? 'Đang xử lý...' : 'Chụp ảnh tài liệu'}</button>
      {:else}
        <button type="button" class="btn-main" disabled={busy} on:click={openCamera}>📷 {busy ? 'Đang xử lý...' : 'Mở camera chụp tài liệu'}</button>
      {/if}
      <button type="button" class="btn-outline" on:click={() => fileInput?.click()}>🖼️ Chọn ảnh có sẵn</button>
    </div>
  {/if}

  <input
    bind:this={fileInput}
    type="file"
    accept="image/*"
    capture={isMobile ? 'environment' : undefined}
    class="sr-only"
    aria-label="Chụp hoặc chọn ảnh tài liệu"
    on:change={handleFileInput}
  />

  {#if cameraOn && !previewUrl}
    <div class="camera-live">
      <video bind:this={videoEl} autoplay playsinline muted></video>
      <div class="camera-actions">
        <button type="button" class="btn-main" disabled={busy} on:click={snapPhoto}>{busy ? 'Đang chụp...' : '📸 Chụp'}</button>
        <button type="button" class="btn-outline" on:click={() => { stopStream(); cameraOn = false; }}>Đóng camera</button>
      </div>
    </div>
  {/if}

  {#if previewUrl}
    <div class="camera-preview">
      <img src={previewUrl} alt="Ảnh tài liệu vừa chụp" />
      <div class="camera-actions">
        <button type="button" class="btn-main" on:click={confirm}>✓ Dùng ảnh này</button>
        <button type="button" class="btn-outline" on:click={retake}>↻ Chụp lại</button>
      </div>
    </div>
  {/if}

  {#if cameraError}<p class="camera-error" role="alert">{cameraError}</p>{/if}
</div>

<style>
  .camera-capture { margin-top: 12px; }
  .camera-start { display: flex; gap: 8px; flex-wrap: wrap; }
  .camera-live video { width: 100%; max-height: 360px; object-fit: cover; border-radius: 8px; background: #18181b; }
  .camera-preview img { width: 100%; max-height: 360px; object-fit: contain; border-radius: 8px; border: 1px solid #e7e5e4; background: #fdfbf7; }
  .camera-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
  .camera-error { color: #b91c1c; font-size: .85rem; margin-top: 8px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .btn-main,.btn-outline { border-radius: 6px; min-height: 44px; padding: 9px 17px; font-weight: 600; }
  .btn-main { background: #059669; color: #fff; border: 1px solid #047857; }
  .btn-outline { background: #fff; color: #059669; border: 1px solid #a7f3d0; }
</style>
