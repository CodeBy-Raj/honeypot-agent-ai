
import {API_KEY} from '../config/env.js';

const verifyApiKey= (req,res,next)=>{
    const api_key=req.headers["x-api-key"];

    if(!api_key || api_key!==API_KEY){
        return res.status(401).json({
            error:"Unauthorized: Invalid or missing api key"
        })
    }

    next();
}

export default verifyApiKey;