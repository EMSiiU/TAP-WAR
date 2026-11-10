import { defineRoom, defineServer, matchMaker } from 'colyseus'
import { ArenaRoom } from './rooms/ArenaRoom.js'

const server = defineServer({
    rooms: {
        arena: defineRoom(ArenaRoom),
    },
    express: (app) => {
        app.get('/health', (_request, response) => {
            response.json({ ok: true })
        })
    },
})

await server.listen(2567, '127.0.0.1')
await matchMaker.createRoom('arena', {})
