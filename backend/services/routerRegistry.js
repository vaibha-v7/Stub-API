const express = require("express")
const Endpoint = require("../models/Endpoint")

let mockRouter = express.Router()

const buildRouter = (endpoints) => {
  const router = express.Router()

  endpoints.forEach((endpoint) => {
    const method = endpoint.method.toLowerCase()
    const path = endpoint.name

    router[method](path, async (req, res) => {

      // latency simulation
      if (endpoint.latencyMs > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, endpoint.latencyMs)
        )
      }

      // force error simulation
      if (endpoint.forceError) {
        return res.status(endpoint.forceError).json({
          error: "Forced error",
          statusCode: endpoint.forceError,
        })
      }

      // GET — return all generated data
      if (method === "get") {
        return res.json(endpoint.generatedData)
      }

      // POST — echo back what frontend sent + add id
      if (method === "post") {
        return res.status(201).json({
          id: Math.random().toString(36).slice(2),
          ...req.body,
        })
      }

      // PUT / PATCH — echo back what frontend sent
      if (method === "put" || method === "patch") {
        return res.json({
          ...req.body,
        })
      }

      // DELETE — confirm deletion
      if (method === "delete") {
        return res.json({ message: "Deleted successfully" })
      }
    })
  })

  return router
}


const rebuildRouter = async () => {
  const endpoints = await Endpoint.find()
  mockRouter = buildRouter(endpoints)
  console.log(`Router rebuilt with ${endpoints.length} endpoints`)
}

const getMockRouter = () => mockRouter

module.exports = { rebuildRouter, getMockRouter }