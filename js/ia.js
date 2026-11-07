// js/ia.js

// PEGA AQUÍ TU API KEY REAL GENERADA EN GOOGLE AI STUDIO
const GEMINI_API_KEY = "TU_API_KEY_AQUI"; 

window.enviarPreguntaIA = async function() {
    const input = document.getElementById('ai-input');
    const container = document.getElementById('ai-chat-messages');
    if (!input || !container) return;

    const pregunta = input.value.trim();
    if (!pregunta) return;

    // Mostrar mensaje del usuario en el chat
    container.innerHTML += `<div style="background: var(--green-primary); color: white; padding: 8px 12px; border-radius: 8px; align-self: flex-end; max-width: 80%;">${pregunta}</div>`;
    input.value = '';
    container.scrollTop = container.scrollHeight;

    // Tomar el caché actual del hato para dárselo como contexto a la IA
    const resumenHato = window.datosHatoCache ? JSON.stringify(window.datosHatoCache) : "No hay datos cargados en caché.";
    
    const promptSistema = `
        Eres el asistente experto en ganadería de doble propósito para "Agropecuaria ElbaLui" (Fincas Agua Clara y El Sur en Monagas, Venezuela).
        Tienes acceso a la siguiente base de datos actual del hato en formato JSON:
        ${resumenHato}
        
        Responde a la pregunta del usuario de forma directa, técnica y profesional, usando los datos reales provistos (aretes, pesos, categorías, estatus reproductivo y salud).
    `;

    const idPensando = 'pensando-' + Date.now();
    container.innerHTML += `<div id="${idPensando}" style="background: #e2e8f0; color: #64748b; padding: 8px 12px; border-radius: 8px; align-self: flex-start; font-style: italic;">Analizando hato ganadero...</div>`;
    container.scrollTop = container.scrollHeight;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [
                    { role: "user", parts: [{ text: promptSistema + "\n\nPregunta del usuario: " + pregunta }] }
                ]
            })
        });

        const data = await response.json();
        const elPensando = document.getElementById(idPensando);
        if (elPensando) elPensando.remove();

        if (data.candidates && data.candidates[0].content) {
            const respuestaIA = data.candidates[0].content.parts[0].text;
            container.innerHTML += `<div style="background: white; border: 1px solid var(--border-light); padding: 8px 12px; border-radius: 8px; align-self: flex-start; max-width: 90%; color: var(--text-dark);">${respuestaIA}</div>`;
        } else {
            throw new Error("No se pudo obtener respuesta de la API de Google.");
        }
    } catch (err) {
        const elPensando = document.getElementById(idPensando);
        if(elPensando) elPensando.remove();
        container.innerHTML += `<div style="background: #fee2e2; color: #991b1b; padding: 8px 12px; border-radius: 8px; align-self: flex-start;">❌ Error al conectar con la IA: ${err.message}</div>`;
    }
    container.scrollTop = container.scrollHeight;
};
