import app from './app.js';
import {PORT} from '../src/config/env.js';
import honeyPotRoute from '../src/routes/honeypot.js';

app.use('/api', honeyPotRoute);

app.listen(PORT, ()=>{
    console.log('Server is listening to port',PORT);
});

