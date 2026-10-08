import { useQuery } from '@tanstack/react-query'
import { SOURCES } from '../api/sources'

export function useComic(source, id) {
  return useQuery({
    queryKey: ['comic', source, id],
    // Fonte sconosciuta (es. un vecchio link /opera/mock/...): errore leggibile, non un crash
    queryFn: () => {
      if (!SOURCES[source]) throw new Error(`fonte "${source}" non più disponibile`)
      return SOURCES[source].fetchComicById(id)
    },
    enabled: Boolean(source && id),
  })
}
