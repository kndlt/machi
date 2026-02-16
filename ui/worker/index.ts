import { Hono } from 'hono'

const app = new Hono()

app.get('/api/health', (c) => {
  return c.text(`Machi: I'm healthy and ready to serve!`)
})

export default app
