import http from 'http'
import express from 'express'
import { Server } from 'socket.io'
import mongoose from 'mongoose'
import Pixel from './models/Pixel.js'

const app = express()
const server = http.createServer(app)
const io = new Server(server)

import dotenv from 'dotenv'
dotenv.config()

import morgan from 'morgan'
import 'express-async-errors'

import { dirname } from 'path'
import { fileURLToPath } from 'url'
import path from 'path'
const __dirname = dirname(fileURLToPath(import.meta.url))

import helmet from 'helmet'
import xss from 'xss-clean'
import mongoSanitize from 'express-mongo-sanitize'

// db and authentication
import connectDB from './db/connect.js'

// routers
import authRouter from './routes/authRoute.js'
import pixelmapRouter from './routes/pixelmapRoute.js'
import userRouter from './routes/userRoute.js'

// middleware
import notFoundMiddleware from './middleware/not-found.js'
import errorHandlerMiddeware from './middleware/error-handler.js'
import authenticateUser from './middleware/auth.js'

if (process.env.NODE_ENV !== 'Production') {
  app.use(morgan('dev'))
}

// only when production
app.use(express.static(path.resolve(__dirname, './client/build')))
app.use(helmet())
app.use(xss())
app.use(mongoSanitize())

app.use(express.json())

// app.get('/', (req, res) => {
//   res.send('Welcome!')
// })

app.use('/api/v1/auth', authRouter)
app.use('/api/v1/pixelmap', authenticateUser, pixelmapRouter)
// app.use('/api/v1/pixelmap', pixelmapRouter)
app.use('/api/v1/user', authenticateUser, userRouter)

// only when production
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, './client/build', 'index.html'))
})

app.use(notFoundMiddleware)
app.use(errorHandlerMiddeware)

const PORT = process.env.PORT || 5500

io.of('/api/v1/socket').on('connection', (socket) => {
  // console.log('socket.io: User connected: ', socket.id)

  socket.on('disconnect', () => {
    // console.log('socket.io: User disconnected: ', socket.id)
  })
})

const start = async () => {
  try {
    connectDB(process.env.MONGO_URL)
    const connection = mongoose.connection

    connection.once('open', () => {
      console.log('MongoDB database connected')

      console.log('Setting change streams')
      const pixelmapChangeStream = connection.collection('pixels').watch()

      pixelmapChangeStream.on('change', async (change) => {
        switch (change.operationType) {
          case 'insert':
            var pixel = {
              row: change.fullDocument.row,
              color: change.fullDocument.color,
              state: change.fullDocument.state,
            }
            io.of('/api/v1/socket').emit('newPixel', pixel)
            break

          case 'update':
            const pixelexist = await Pixel.findOne({
              _id: change.documentKey._id.toString(),
            })
            io.of('/api/v1/socket').emit('newPixel', pixelexist)
            break

          default:
            break
        }
      })
    })
    server.listen(PORT, () => {
      console.log(`Server is listening on port ${PORT}...`)
    })
  } catch (error) {
    console.log(error)
  }
}

start()

import CronJob from 'node-cron'
import User from './models/User.js'

CronJob.schedule('0 0 */23 * * *', async () => {
  const users = await User.find()

  for (const user of users) {
    user.point += 1
    await user.save()
  }

  const d = new Date()
})
