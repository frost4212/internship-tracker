async function fetchInternships(keyword, location, country, page = 1) {
  const params = new URLSearchParams({
    keyword,
    country,
    page: String(page),
  });

  if (location) {
    params.set("location", location);
  }

  const response = await fetch(`/api/internships?${params}`);

  if (!response.ok) {
    let message = "Could not load internships.";

    try {
      const data = await response.json();
      message = data.error || message;
    } catch {
      // Keep the default message if the response is not JSON.
    }

    throw new Error(message);
  }

  return response.json();
}
