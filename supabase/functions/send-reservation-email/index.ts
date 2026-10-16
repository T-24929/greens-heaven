import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'
import QRCode from 'qrcode'
import { createEmailHandler } from './handler.mjs'

Deno.serve(createEmailHandler({
  env: Deno.env.toObject(),
  createClient,
  createTransport: nodemailer.createTransport,
  generateQr: (url: string) => QRCode.toBuffer(url, { type: 'png', width: 360, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } }),
}))
