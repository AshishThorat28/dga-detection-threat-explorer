export async function request(path, options={}) { const response = await fetch('/api'+path, options); return response.json(); }
