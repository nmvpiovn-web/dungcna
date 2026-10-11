<script>
  import { onDestroy } from 'svelte';

  // Props: onCapture(file | files), onCaptureFiles(files)
  let { onCapture, onCaptureFiles } = $props();

  const MAX_IMAGES = 6;
  let items = $state([]); // { file, previewUrl, id }
  let cameraOn = $state(false);
  let cameraError = $state('');
  let busy = $state(false);
  let videoEl = $state(null);
  let stream = $state(null);
  let fileInput = $state(null);

  const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

  function compressToJpeg(source, sw, sh, name = 'capture.jpg') {
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
          resolve(new File([blob], name, { type: 'image/jpeg' }));
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
    const rawFiles = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = '';
    if (!rawFiles.length) return;

    if (items.length + rawFiles.length > MAX_IMAGES) {
      cameraError = `Tối đa ${MAX_IMAGES} ảnh cho một lần tạo Auto. Đã bỏ qua các ảnh vượt quá giới hạn.`;
    } else {
      cameraError = '';
    }

    const availableSlots = MAX_IMAGES - items.length;
    const toProcess = rawFiles.slice(0, availableSlots);

    busy = true;
    try {
      for (let i = 0; i < toProcess.length; i++) {
        const file = toProcess[i];
        const { img, url } = await fileToImage(file);
        const fileName = file.name || `page_${items.length + 1}.jpg`;
        const compressed = await compressToJpeg(img, img.naturalWidth, img.naturalHeight, fileName);
        URL.revokeObjectURL(url);
        const previewUrl = URL.createObjectURL(compressed);
        items = [...items, { file: compressed, previewUrl, id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }];
      }
    } catch {
      cameraError = 'Không thể xử lý một số ảnh. Hãy thử lại.';
    } finally {
      busy = false;
    }
  }

  async function openCamera() {
    cameraError = '';
    if (items.length >= MAX_IMAGES) {
      cameraError = `Đã đạt tối đa ${MAX_IMAGES}/6 ảnh. Hãy xóa bớt để chụp thêm.`;
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraError = 'Trình duyệt không hỗ trợ camera. Hãy chọn file ảnh.';
      fileInput?.click();
      return;
    }
    try {
      stopStream();
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      cameraOn = true;
      requestAnimationFrame(() => { if (videoEl && stream) videoEl.srcObject = stream; });
    } catch {
      cameraError = 'Không mở được camera (bị từ chối hoặc không có camera). Hãy chọn file ảnh.';
      fileInput?.click();
    }
  }

  async function snapPhoto() {
    if (!videoEl || !stream) return;
    if (items.length >= MAX_IMAGES) {
      cameraError = `Đã đạt tối đa ${MAX_IMAGES}/6 ảnh.`;
      stopStream();
      cameraOn = false;
      return;
    }
    busy = true;
    try {
      const vw = videoEl.videoWidth || 1280;
      const vh = videoEl.videoHeight || 720;
      const compressed = await compressToJpeg(videoEl, vw, vh, `page_${items.length + 1}.jpg`);
      const previewUrl = URL.createObjectURL(compressed);
      items = [...items, { file: compressed, previewUrl, id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }];
      if (items.length >= MAX_IMAGES) {
        stopStream();
        cameraOn = false;
      }
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

  function moveItem(index, direction) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    const copy = [...items];
    [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
    items = copy;
  }

  function removeItem(index) {
    const target = items[index];
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
    items = items.filter((_, i) => i !== index);
    cameraError = '';
  }

  function clearAll() {
    for (const it of items) {
      if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
    }
    items = [];
    cameraError = '';
  }

  function confirm() {
    if (!items.length) return;
    const files = items.map((it) => it.file);
    if (onCaptureFiles) onCaptureFiles(files);
    if (onCapture) onCapture(files.length === 1 ? files[0] : files);
  }

  onDestroy(() => {
    stopStream();
    for (const it of items) {
      if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
    }
  });
</script>

<div class="camera-capture">
  <div class="camera-header">
    <span class="count-badge" class:full={items.length >= MAX_IMAGES}>
      📸 {items.length}/{MAX_IMAGES} ảnh
    </span>
    {#if items.length > 0}
      <button type="button" class="btn-clear" on:click={clearAll}>Xóa tất cả</button>
    {/if}
  </div>

  {#if items.length < MAX_IMAGES && !cameraOn}
    <div class="camera-start">
      {#if isMobile}
        <button type="button" class="btn-main" disabled={busy} on:click={() => fileInput?.click()}>
          📷 {busy ? 'Đang xử lý...' : 'Chụp ảnh tài liệu'}
        </button>
      {:else}
        <button type="button" class="btn-main" disabled={busy} on:click={openCamera}>
          📷 {busy ? 'Đang xử lý...' : 'Mở camera chụp'}
        </button>
      {/if}
      <button type="button" class="btn-outline" on:click={() => fileInput?.click()}>
        🖼️ Chọn ảnh (tối đa 6)
      </button>
    </div>
  {/if}

  <input
    bind:this={fileInput}
    type="file"
    accept="image/jpeg,image/png,image/webp"
    multiple
    capture={isMobile ? 'environment' : undefined}
    class="sr-only"
    aria-label="Chụp hoặc chọn tối đa 6 ảnh tài liệu"
    on:change={handleFileInput}
  />

  {#if cameraOn}
    <div class="camera-live">
      <video bind:this={videoEl} autoplay playsinline muted></video>
      <div class="camera-actions">
        <button type="button" class="btn-main" disabled={busy || items.length >= MAX_IMAGES} on:click={snapPhoto}>
          {busy ? 'Đang chụp...' : `📸 Chụp trang ${items.length + 1}/${MAX_IMAGES}`}
        </button>
        <button type="button" class="btn-outline" on:click={() => { stopStream(); cameraOn = false; }}>
          Đóng camera
        </button>
      </div>
    </div>
  {/if}

  {#if items.length > 0}
    <div class="gallery-preview">
      <div class="gallery-grid">
        {#each items as item, idx (item.id)}
          <div class="thumb-card">
            <span class="thumb-order">{idx + 1}/{items.length}</span>
            <img src={item.previewUrl} alt={`Trang tài liệu ${idx + 1}`} />
            <div class="thumb-actions">
              <button
                type="button"
                aria-label={`Chuyển ảnh ${idx + 1} lên trước`}
                disabled={idx === 0}
                on:click={() => moveItem(idx, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Chuyển ảnh ${idx + 1} xuống sau`}
                disabled={idx === items.length - 1}
                on:click={() => moveItem(idx, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                class="btn-del"
                aria-label={`Xóa ảnh ${idx + 1}`}
                on:click={() => removeItem(idx)}
              >
                ×
              </button>
            </div>
          </div>
        {/each}
      </div>

      <div class="confirm-bar">
        <button type="button" class="btn-main" on:click={confirm}>
          ✓ Dùng {items.length} ảnh này để tạo Quiz
        </button>
        {#if items.length < MAX_IMAGES && !cameraOn}
          <button type="button" class="btn-outline" on:click={() => fileInput?.click()}>
            ＋ Thêm ảnh ({items.length}/6)
          </button>
        {/if}
      </div>
    </div>
  {/if}

  {#if cameraError}<p class="camera-error" role="alert">{cameraError}</p>{/if}
</div>

<style>
  .camera-capture { margin-top: 12px; }
  .camera-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .count-badge { font-size: 0.85rem; font-weight: 700; color: #1c1917; background: #e7e5e4; padding: 4px 10px; border-radius: 9999px; }
  .count-badge.full { background: #059669; color: #fff; }
  .btn-clear { background: none; border: none; font-size: 0.8rem; color: #78716c; cursor: pointer; text-decoration: underline; padding: 4px; }
  .camera-start { display: flex; gap: 8px; flex-wrap: wrap; }
  .camera-live video { width: 100%; max-height: 320px; object-fit: cover; border-radius: 8px; background: #1c1917; }
  .camera-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
  .gallery-preview { margin-top: 12px; background: #fafaf9; border: 1px solid #e7e5e4; border-radius: 8px; padding: 12px; }
  .gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; }
  .thumb-card { position: relative; border: 1px solid #e7e5e4; border-radius: 6px; background: #fff; overflow: hidden; display: flex; flex-direction: column; }
  .thumb-card img { width: 100%; height: 110px; object-fit: cover; }
  .thumb-order { position: absolute; top: 4px; left: 4px; background: rgba(28, 25, 23, 0.8); color: #fff; font-size: 0.7rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; }
  .thumb-actions { display: flex; justify-content: space-between; background: #f5f5f4; border-top: 1px solid #e7e5e4; padding: 2px; }
  .thumb-actions button { background: none; border: none; font-size: 0.85rem; font-weight: 700; color: #44403c; padding: 4px 8px; cursor: pointer; min-height: 32px; min-width: 32px; border-radius: 4px; }
  .thumb-actions button:hover:not(:disabled) { background: #e7e5e4; }
  .thumb-actions button.btn-del { color: #dc2626; font-size: 1rem; }
  .thumb-actions button:disabled { opacity: 0.3; cursor: not-allowed; }
  .confirm-bar { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
  .camera-error { color: #b91c1c; font-size: .85rem; margin-top: 8px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .btn-main, .btn-outline { border-radius: 6px; min-height: 44px; padding: 9px 17px; font-weight: 600; cursor: pointer; }
  .btn-main { background: #059669; color: #fff; border: 1px solid #047857; }
  .btn-main:hover { background: #047857; }
  .btn-outline { background: #fff; color: #059669; border: 1px solid #a7f3d0; }
  .btn-outline:hover { background: #f0fdf4; }
</style>
