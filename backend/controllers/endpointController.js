const Endpoint = require("../models/Endpoint")
const { chatWithAI, generateData } = require("../services/llmService")
const { rebuildRouter } = require("../services/routerRegistry")

// GET /api/endpoints
const getAllEndpoints = async (req, res) => {
  try {
    const endpoints = await Endpoint.find()
    res.json(endpoints)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// POST /api/endpoints/chat
const chat = async (req, res) => {
  try {
    const { sessionId, message } = req.body
    const response = await chatWithAI(sessionId, message)
    res.json(response)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// POST /api/endpoints/confirm
// called after user confirms fields on the frontend
const confirmEndpoint = async (req, res) => {
  try {
    const { name, method, fields } = req.body

    // step 1 — generate realistic data using Gemini
    const generatedData = await generateData(name, fields)

    // step 2 — save endpoint to MongoDB
    const endpoint = await Endpoint.create({
      name,
      method,
      fields,
      generatedData,
      latencyMs: 0,
      forceError: null,
    })

    // step 3 — rebuild router so new route is live immediately
    await rebuildRouter()

    res.status(201).json(endpoint)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// PUT /api/endpoints/:id
const updateEndpoint = async (req, res) => {
  try {
    const { id } = req.params
    const { latencyMs, forceError } = req.body

    const endpoint = await Endpoint.findByIdAndUpdate(
      id,
      { latencyMs, forceError },
      { new: true }
    )

    if (!endpoint) {
      return res.status(404).json({ error: "Endpoint not found" })
    }

    // rebuild router so changes are live immediately
    await rebuildRouter()

    res.json(endpoint)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// DELETE /api/endpoints/:id
const deleteEndpoint = async (req, res) => {
  try {
    const { id } = req.params

    const endpoint = await Endpoint.findByIdAndDelete(id)

    if (!endpoint) {
      return res.status(404).json({ error: "Endpoint not found" })
    }

    // rebuild router so deleted route is removed immediately
    await rebuildRouter()

    res.json({ message: "Endpoint deleted" })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

module.exports = {
  getAllEndpoints,
  chat,
  confirmEndpoint,
  updateEndpoint,
  deleteEndpoint,
}