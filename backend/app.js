require("dotenv").config()
const express = require("express")
const cors = require("cors")
const connectDB = require("./config/db")
const { rebuildRouter, getMockRouter } = require("./services/routerRegistry")
const endpointRoutes = require("./routes/endpointRoutes")
const errorHandler = require("./middleware/errorHandler")
require("./config/env")
const path = require("path")

const app = express()

app.use(cors())
app.use(express.json())

// Serve static frontend assets
app.use(express.static(path.join(__dirname, "public")))

app.use("/api/endpoints", endpointRoutes)

app.use("/mock", (req, res, next) => {
  getMockRouter()(req, res, next)
})

// Client-side routing fallback (SPA)
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api") || req.path.startsWith("/mock")) {
    return next()
  }
  res.sendFile(path.join(__dirname, "public", "index.html"), (err) => {
    if (err) next()
  })
})

app.use(errorHandler)


const start = async () => {
  await connectDB()
  await rebuildRouter()

  const PORT = process.env.PORT || 4000
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
    console.log(`Stub API Dashboard → http://localhost:${PORT}`)
    console.log(`Mock server        → http://localhost:${PORT}/mock (Runs only when endpoints are created)`)
  })
}

start()

module.exports = app