export const fetchAPI = async (endpoint, options) => {
    const res = await fetch(`http://localhost:3000/api${endpoint}`, options);
    if (!res.ok)
        throw new Error(await res.text());
    return res.json();
};
