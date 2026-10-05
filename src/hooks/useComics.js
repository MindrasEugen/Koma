import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { SOURCES } from '../api/sources'

export const PAGE_SIZE = 24

// params: { q, genre, type, page } — fanno parte della chiave, così ogni
// combinazione di ricerca/filtri/pagina ha la sua cache. keepPreviousData
// tiene a schermo la pagina precedente mentre arriva la successiva.
export function useComics(sourceKey, params) {
  return useQuery({
    queryKey: ['comics', sourceKey, params],
    queryFn: () => SOURCES[sourceKey].fetchComics({ ...params, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })
}

export function useGenres(sourceKey) {
  return useQuery({
    queryKey: ['genres', sourceKey],
    queryFn: () => SOURCES[sourceKey].fetchGenres(),
    staleTime: 5 * 60 * 1000,
  })
}
