// Search, filter, sort and pagination logic (pure functions, no DOM).

const norm = (s) => String(s ?? '').toLowerCase().trim();

function haystack(b) {
  return norm([b.title, b.author, b.departmentName, b.specializationName, b.subject, b.isbn, b.bookId, b.publisher].join(' | '));
}

/** Every word of the query must match somewhere. Results are ranked: title > author > rest. */
export function searchBooks(books, query) {
  const tokens = norm(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return books;
  const scored = [];
  books.forEach((b) => {
    const h = haystack(b);
    if (!tokens.every((t) => h.includes(t))) return;
    const title = norm(b.title);
    const author = norm(b.author);
    let score = 0;
    tokens.forEach((t) => {
      if (title.startsWith(t)) score += 6; else if (title.includes(t)) score += 4;
      if (author.includes(t)) score += 2;
      if (norm(b.subject).includes(t)) score += 2;
      score += 1;
    });
    scored.push({ b, score: score + b.popularity / 1000 });
  });
  return scored.sort((x, y) => y.score - x.score).map((s) => s.b);
}

export function getSuggestions(books, query, limit = 6) {
  return searchBooks(books, query).slice(0, limit);
}

/**
 * filters: { q, dept, spec, minPrice, maxPrice, authors:[], publishers:[], minRating, availability: 'all'|'in'|'out' }
 */
export function filterBooks(books, filters = {}) {
  const { q, dept, spec, minPrice, maxPrice, authors = [], publishers = [], minRating = 0, availability = 'all' } = filters;
  let list = q ? searchBooks(books, q) : books;
  return list.filter((b) => {
    if (dept && b.department !== dept) return false;
    if (spec && b.specialization !== spec) return false;
    if (Number.isFinite(minPrice) && b.price < minPrice) return false;
    if (Number.isFinite(maxPrice) && b.price > maxPrice) return false;
    if (authors.length && !authors.includes(b.author)) return false;
    if (publishers.length && !publishers.includes(b.publisher)) return false;
    if (minRating && b.rating < minRating) return false;
    if (availability === 'in' && b.stock <= 0) return false;
    if (availability === 'out' && b.stock > 0) return false;
    return true;
  });
}

/** keys: relevance (keep order) | price-asc | price-desc | newest | rating | popular */
export function sortBooks(books, key = 'relevance') {
  const list = [...books];
  switch (key) {
    case 'price-asc': return list.sort((a, b) => a.price - b.price);
    case 'price-desc': return list.sort((a, b) => b.price - a.price);
    case 'newest': return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    case 'rating': return list.sort((a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount);
    case 'popular': return list.sort((a, b) => b.popularity - a.popularity);
    default: return list;
  }
}

export const SORT_KEYS = ['relevance', 'price-asc', 'price-desc', 'newest', 'rating', 'popular'];

export function paginate(items, page = 1, size = 24) {
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  return { items: items.slice((current - 1) * size, current * size), page: current, totalPages, total: items.length };
}

/** Distinct authors / publishers with counts for the sidebar facets. */
export function getFacets(books) {
  const count = (field) => {
    const map = new Map();
    books.forEach((b) => { if (b[field]) map.set(b[field], (map.get(b[field]) || 0) + 1); });
    return [...map].map(([name, n]) => ({ name, count: n })).sort((a, b) => a.name.localeCompare(b.name));
  };
  return { authors: count('author'), publishers: count('publisher') };
}
