import axios from 'axios';

async function test() {
  try {
    const r = await axios.get('http://0.0.0.0:3000/api/diagnostic');
    console.log(JSON.stringify(r.data, null, 2));
  } catch (e) {
    if (e.response) {
      console.log('Error from diagnostic', e.response.data);
    } else {
      console.log('Fetch error', e.message);
    }
  }
}
test();
