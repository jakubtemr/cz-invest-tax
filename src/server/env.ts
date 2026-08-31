import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().default('postgres://invest:invest@localhost:5459/invest'),
  T212_API_KEY: z.string().optional(),
  T212_API_SECRET: z.string().optional(),
  T212_API_BASE: z
    .string()
    .url()
    .refine((url) => url.startsWith('https://'), 'T212_API_BASE must be https - the auth header travels over it')
    .default('https://live.trading212.com'),
  PORT: z.coerce.number().int().default(8792),
})

export type Env = z.infer<typeof envSchema>

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source)
}
