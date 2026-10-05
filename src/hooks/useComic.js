import { useQuery } from '@tanstack/react-query'
import { SOURCES } from '../api/sources'

export function useComic(source, id) {
  return useQuery({
    queryKey: ['comic', source, id],
    queryFn: () => SOURCES[source].fetchComicById(id),
    enabled: Boolean(source && id),
  })
}
