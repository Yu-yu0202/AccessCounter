import express, { Request, Response, RequestHandler } from "express";
import Redis from "ioredis";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

dotenv.config()
const app = express();
const redis: Redis = new Redis({
    host: process.env.redis_host || "localhost",
    port: Number(process.env.redis_port) || 6379,
    password: process.env.redis_password
});

type siteIds = {
    result: [string, number][];
}

app.get("/counter/get", (async (req: Request, res: Response) => {
    const {accountid, siteid, pageid} = req.body;
    if (!(accountid && siteid && pageid)) {
        return res.status(400).json({error: "Insufficient authentication information"});
    }
    const key = `counter:${accountid}:${siteid}:${pageid}`;
    await redis.get(key, (err, value) => {
        if (err || !value) {return res.status(500).json({error: "Internal server error"});};
        const count = parseInt(value, 10);
        return res.status(200).json({count: count});
    });
}) as RequestHandler);

app.put("/counter/add", (async (req: Request, res: Response) => {
    const {accountid, siteid, pageid} = req.body;
    if (!(accountid && siteid && pageid)) {
        return res.status(400).json({error: "Insufficient authentication information"});
    }
    const key = `counter:${accountid}:${siteid}:${pageid}`;
    await redis.incr(key, (err, value) => {
        if (err || !value) {return res.status(500).json({error: "Internal server error"});};
        return res.status(200).json({count: value});
    });
}) as RequestHandler);

app.post("/admin/register", (async (req: Request, res: Response) => {
    const {authentication, password} = req.body;
    if (!authentication || !password) {
        return res.status(400).json({error: "Rogue request"});
    }
    await redis.get('admin_pass', (err, value) => {
        if (err || !value) {return res.status(500).json({error: "Internal server error"});};
        if (value !== authentication) {
            return res.status(403).json({error: "Forbidden"});
        }
    });
    const accountid = uuidv4();
    const passwordHash = bcrypt.hashSync(password, 10); 
    await redis.set(`counter:${accountid}`, passwordHash, 'NX', (err) => {
        if (err) {
            return res.status(500).json({error: "Internal server error"});
        }
        return res.status(200).json({message: "Account registered successfully", accountid: accountid});
    })
}) as RequestHandler);

app.post("/api/new_site_id", (async (req: Request, res: Response) => {
    const {accountid, authentication} = req.body;
    if (!(accountid && authentication)) {
        return res.status(400).json({error: "Insufficient authentication information"});
    }
    await redis.get(`counter:${accountid}`, (err, value) => {
        if (err || !value) {return res.status(500).json({error: "Internal server error"});};
        if (!bcrypt.compareSync(authentication, value)) {
            return res.status(403).json({error: "Forbidden"});
        }
    });
    const siteid = uuidv4();
    await redis.set(`site:${accountid}:${siteid}`, 0, 'NX', (err) => {
        if (err) {
            return res.status(500).json({error: "Internal server error"});
        }
        return res.status(200).json({message: "Site ID created successfully", siteid: siteid});
    });
}) as RequestHandler);

app.get('/api/get_site_id', (async (req: Request, res: Response) => {
    const {accountid, authentication} = req.body;
    if (!(accountid && authentication)) {
        return res.status(400).json({error: "Insufficient authentication information"});
    };
    await redis.get(`counter:${accountid}`, (err, value) => {
        if (err || !value) {return res.status(500).json({error: "Internal server error"});};
        if (!bcrypt.compareSync(authentication, value)) {
            return res.status(403).json({error: "Forbidden"});
        }
    });
    const siteIds: siteIds = {result: []};
    try {
        const keys = await redis.keys(`site:${accountid}:*`);
        if (!keys || keys.length === 0) {
            res.status(404).json({error: "No site IDs found for this account"});
            return;
        }
        const counterPromises = keys.map(async (key) => {
            const siteid = key.split(':')[2];
            try {
                const value = await redis.get(`counter:${accountid}:${siteid}`);
                return [siteid, parseInt(value!, 10)] as [string, number];
            } catch (err) {
                return [siteid, 0] as [string, number];
            }
        });
        const results = await Promise.all(counterPromises);
        siteIds.result = results;
        res.status(200).json(JSON.stringify(siteIds));
    } catch (err) {
        res.status(500).json({error: "Internal server error"});
    }
}) as RequestHandler);

app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({status: "ok", timestamp: new Date().toISOString(), db: {redis: redis.status, ping: redis.ping()}});
});

export default app;