async function test() {
  try {
    const resWorker = await fetch('https://tienganh7.tienganh7-sveltekit.workers.dev');
    console.log('Worker status:', resWorker.status);
    const textWorker = await resWorker.text();
    console.log('Worker text preview:', textWorker.substring(0, 200));
  } catch (e) {
    console.error('Worker error:', e.message);
  }

  try {
    const resDomain = await fetch('https://timbk.io.vn');
    console.log('Domain timbk.io.vn status:', resDomain.status);
    const textDomain = await resDomain.text();
    console.log('Domain text preview:', textDomain.substring(0, 200));
  } catch (e) {
    console.error('Domain error:', e.message);
  }

  try {
    const resPages = await fetch('https://tienganh7-pro.pages.dev');
    console.log('Pages status:', resPages.status);
    const textPages = await resPages.text();
    console.log('Pages title/text preview:', textPages.substring(0, 200));
  } catch (e) {
    console.error('Pages error:', e.message);
  }
}

test();
