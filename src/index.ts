import 'dotenv/config';
import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import { Pool } from 'pg';

const fastify = Fastify({ logger: false });


const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  max: 30,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 3000,
  maxUses: 7500,
});

pool.on("error", (err) => {
  // Ignora erros de clientes ociosos (idle) para o Node não crashar.
  console.error("Unexpected error on idle client", err);
});


const schema = {
  body: {
    type: 'object',
    required: ['evento_id', 'usuario_id'],
    properties: {
      evento_id: { type: 'number' },
      usuario_id: { type: 'number' }
    }
  }
};

fastify.get('/eventos', async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { rows } = await pool.query('SELECT id, nome, ingressos_disponiveis FROM eventos');
    reply.status(200).send(rows);
  } catch (error) {
    reply.status(500).send({ error: 'Erro interno' });
  }
});

interface ReservaBody {
  evento_id: number;
  usuario_id: number;
}

fastify.post<{ Body: ReservaBody }>('/reservas', { schema }, async (request, reply) => {
  const { evento_id, usuario_id } = request.body;

  try {
    const result = await pool.query(
      `
      WITH updated AS (
        UPDATE eventos 
        SET ingressos_disponiveis = ingressos_disponiveis - 1
        WHERE id = $1 AND ingressos_disponiveis > 0
        RETURNING id
      )
      INSERT INTO reservas (evento_id, usuario_id)
      SELECT id, $2 FROM updated
      RETURNING id;
      `,
      [evento_id, usuario_id]
    );

    if (result.rowCount === 0) {
      return reply.status(422).send({ error: 'Acabou o estoque ou evento não existe' });
    }

    return reply.status(201).send();
  } catch (error) {
    reply.status(500).send({ error: 'Erro interno' });
  }
});

const start = async () => {
  try {
    await fastify.listen({ port: 8080, host: '0.0.0.0' });
    console.log('Servidor rodando na porta 8080');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();
