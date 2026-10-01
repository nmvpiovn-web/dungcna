<!-- src/routes/offline/+page.svelte — trang dự phòng khi mất mạng (SW fallback).
  Self-contained với inline style để hiển thị được ngay cả khi CSS/JS chưa cache. -->
<script>
  function retry() {
    window.location.reload();
  }
</script>

<svelte:head>
  <title>Mất kết nối — Tiếng Anh Cô Dung</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<main>
  <div class="card">
    <div class="icon">📡</div>
    <h1>Bạn đang ngoại tuyến</h1>
    <p>
      Không có kết nối mạng. Vui lòng kiểm tra Wi-Fi hoặc dữ liệu di động
      rồi thử lại.
    </p>
    <button onclick={retry}>Thử lại</button>
    <a href="/">Về trang chủ</a>
  </div>
</main>

<style>
  main {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: #fff7ed;
    font-family: system-ui, -apple-system, sans-serif;
  }
  .card {
    text-align: center;
    max-width: 380px;
    background: #fff;
    border: 1px solid #fed7aa;
    border-radius: 24px;
    padding: 40px 32px;
    box-shadow: 0 4px 24px rgba(194, 120, 3, 0.08);
  }
  .icon {
    font-size: 56px;
    margin-bottom: 16px;
  }
  h1 {
    font-size: 22px;
    font-weight: 800;
    color: #7c2d12;
    margin: 0 0 12px;
  }
  p {
    font-size: 15px;
    color: #92400e;
    line-height: 1.6;
    margin: 0 0 24px;
  }
  button {
    display: inline-block;
    background: #0891b2;
    color: #fff;
    border: none;
    border-radius: 999px;
    padding: 12px 32px;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    margin-bottom: 12px;
  }
  a {
    display: block;
    font-size: 14px;
    color: #0891b2;
    font-weight: 600;
    text-decoration: none;
  }
</style>
