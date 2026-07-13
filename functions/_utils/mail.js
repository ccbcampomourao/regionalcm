// O Cloudflare Workers/Pages não permite abrir conexão SMTP direta (o que o
// Nodemailer precisa). Por isso, usamos a API HTTP do Resend para enviar o
// e-mail de confirmação.

export async function sendConfirmationCode(env, toEmail, code) {
  const fromAddress = env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `Sistema de Listas <${fromAddress}>`,
      to: [toEmail],
      subject: 'Seu código de confirmação',
      html: `<p>Seu código de confirmação é:</p><h2 style="letter-spacing:4px">${code}</h2><p>Ele expira em 15 minutos.</p>`,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Falha ao enviar e-mail (Resend): ${text}`);
  }
}
