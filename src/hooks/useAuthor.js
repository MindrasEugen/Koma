import { useQuery } from '@tanstack/react-query'
import * as authorsApi from '../api/authors'

export function useAuthor(id) {
  return useQuery({
    queryKey: ['author', id],
    queryFn: () => authorsApi.fetchAuthor(id),
    enabled: Boolean(id),
  })
}

export function useAuthorWorks(id) {
  return useQuery({
    queryKey: ['authorWorks', id],
    queryFn: () => authorsApi.fetchAuthorWorks(id),
    enabled: Boolean(id),
  })
}
