const net = require('net');
const tls = require('tls');

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || 'rd-lounin-guide@localhost';
const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL || 'https://stavba.detasek.cz';

function smtpConfigured() {
  return Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS);
}

function readLine(socket) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      if (/\r?\n$/.test(buffer)) {
        socket.off('data', onData);
        resolve(buffer);
      }
    };
    socket.on('data', onData);
    socket.once('error', reject);
  });
}

async function readResponse(socket) {
  let response = await readLine(socket);
  while (/^\d{3}-/.test(response.split(/\r?\n/).filter(Boolean).at(-1) || '')) {
    response += await readLine(socket);
  }
  return response;
}

async function sendCommand(socket, command, okPrefix = /^2|^3/) {
  socket.write(`${command}\r\n`);
  const response = await readResponse(socket);
  if (!okPrefix.test(response)) throw new Error(`smtp_failed_${command.split(' ')[0]}: ${response.trim()}`);
  return response;
}

function encodeSubject(subject) {
  return `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
}

function messageBody({ to, subject, text }) {
  return [
    `From: ${SMTP_FROM}`,
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    text
  ].join('\r\n');
}

async function sendSmtpMail(mail) {
  let socket = net.createConnection({ host: SMTP_HOST, port: SMTP_PORT });
  await readResponse(socket);
  await sendCommand(socket, `EHLO ${SMTP_HOST}`);
  await sendCommand(socket, 'STARTTLS');
  socket = tls.connect({ socket, servername: SMTP_HOST });
  await sendCommand(socket, `EHLO ${SMTP_HOST}`);
  await sendCommand(socket, 'AUTH LOGIN', /^3/);
  await sendCommand(socket, Buffer.from(SMTP_USER).toString('base64'), /^3/);
  await sendCommand(socket, Buffer.from(SMTP_PASS).toString('base64'));
  await sendCommand(socket, `MAIL FROM:<${SMTP_FROM}>`);
  await sendCommand(socket, `RCPT TO:<${mail.to}>`);
  await sendCommand(socket, 'DATA', /^3/);
  socket.write(`${messageBody(mail)}\r\n.\r\n`);
  await readResponse(socket);
  await sendCommand(socket, 'QUIT', /^2/).catch(() => {});
}

async function sendMail(mail) {
  if (!smtpConfigured()) {
    console.log(`[mail:fallback] to=${mail.to} subject=${mail.subject}\n${mail.text}`);
    return { sent: false, fallback_logged: true };
  }
  await sendSmtpMail(mail);
  return { sent: true };
}

function verificationUrl(token) {
  return `${APP_PUBLIC_URL}/?verify_email_token=${encodeURIComponent(token)}`;
}

function resetUrl(token) {
  return `${APP_PUBLIC_URL}/?reset_password_token=${encodeURIComponent(token)}`;
}

module.exports = {
  sendMail,
  verificationUrl,
  resetUrl
};
