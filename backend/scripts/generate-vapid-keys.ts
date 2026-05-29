/**
 * Генерация VAPID-ключей для Web Push.
 * Запуск: npx tsx scripts/generate-vapid-keys.ts
 * Добавьте вывод в backend/.env на сервере.
 */
import webpush from 'web-push'

const keys = webpush.generateVAPIDKeys()

console.log('Добавьте в backend/.env:\n')
console.log(`VAPID_PUBLIC_KEY="${keys.publicKey}"`)
console.log(`VAPID_PRIVATE_KEY="${keys.privateKey}"`)
console.log('VAPID_SUBJECT="mailto:ваш@email.ru"')
