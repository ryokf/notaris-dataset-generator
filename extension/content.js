console.log("Interceptor Aktif (Mode Catch-All Form & Keepalive)...");

// MENGGUNAKAN MODE SUBMIT + CAPTURING PHASE ('true')
document.addEventListener('submit', (event) => {
    // TANGKAP SEMUA TAG <FORM> TANPA MEMPEDULIKAN ID-NYA!
    const formElement = event.target.closest('form'); 
    
    if (formElement) {
        const formData = new FormData(formElement);
        const dataPayload = Object.fromEntries(formData.entries());
        
        const payload = {
            form_id: formElement.id || "form_dinamis",
            timestamp: new Date().toISOString(),
            data: dataPayload
        };
        
        kirimKeLocalServer(payload);
    }
}, true); // <-- KATA 'true' INI SANGAT PENTING UNTUK MENANGKAP KLIK SEBELUM BROWSER REFRESH

function kirimKeLocalServer(payload) {
    fetch('http://localhost:3000/api/intercept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true // <-- MENCEGAH ERROR "FAILED TO FETCH"
    }).catch(err => console.error("Gagal mengirim data:", err));
}