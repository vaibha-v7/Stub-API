const { GoogleGenerativeAI } = require("@google/generative-ai")

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)



const CHAT_SYSTEM_PROMPT = `
You are an API schema assistant for a mock API tool.
The user will describe an API endpoint and the fields they want in the response.
Your job is to understand exactly what fields they need.

Rules:
1. If the request is clear, confirm the fields by returning ONLY a JSON array. No explanation. No markdown. No backticks.
2. If anything is ambiguous, ask ONE short clarifying question.
3. Once clear, return ONLY this format:
[
  { "name": "fieldName" },
  { "name": "fieldName" }
]

Example:
User: "give me /orders with dishName, price and isVeg"
You: [{"name":"dishName"},{"name":"price"},{"name":"isVeg"}]
`


const chatSessions = new Map()

const chatWithAI = async (sessionId, userMessage) => {
  // create new session if first message
  if (!chatSessions.has(sessionId)) {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: CHAT_SYSTEM_PROMPT,
    })
    const session = model.startChat()
    chatSessions.set(sessionId, session)
  }

  const session = chatSessions.get(sessionId)
  const result = await session.sendMessage(userMessage)
  const text = result.response.text().trim()


  try {
    const fields = JSON.parse(text)
    chatSessions.delete(sessionId) // clear session
    return { done: true, fields }
  } catch {
    return { done: false, message: text }
  }
}



const GENERATE_SYSTEM_PROMPT = `
You are a realistic data generator for a mock API tool.
You will receive a list of field names and an endpoint description.
Generate exactly 10 realistic records as a JSON array.
Return ONLY the JSON array. No explanation. No markdown. No backticks.

Example:
Fields: dishName, price, isVeg
Endpoint: /orders for a food delivery app

You return:
[
  { "dishName": "Paneer Tikka", "price": 350, "isVeg": true },
  { "dishName": "Butter Chicken", "price": 420, "isVeg": false }
  ...8 more
]
`

const generateData = async (endpointName, fields) => {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: GENERATE_SYSTEM_PROMPT,
  })

  const fieldNames = fields.map(f => f.name).join(", ")

  const prompt = `
Endpoint: ${endpointName}
Fields: ${fieldNames}
Generate 10 realistic records.
`

  const result = await model.generateContent(prompt)
  const text = result.response.text().trim()

  try {
    const data = JSON.parse(text)
    return data
  } catch {
    throw new Error("AI returned invalid data. Please try again.")
  }
}

module.exports = { chatWithAI, generateData }