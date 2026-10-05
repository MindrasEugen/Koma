import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/authContext'
import * as watchlistApi from '../api/watchlist'

export function useMyWatchlist() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['watchlist', user?.id],
    queryFn: () => watchlistApi.fetchWatchlist(user.id),
    enabled: Boolean(user),
  })
}

export function useWatchlistEntry(workId) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['watchlistEntry', user?.id, workId],
    queryFn: () => watchlistApi.fetchWatchlistEntry(user.id, workId),
    enabled: Boolean(user && workId),
  })
}

function useInvalidateWatchlist(workId) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['watchlist', user?.id] })
    queryClient.invalidateQueries({ queryKey: ['watchlistEntry', user?.id, workId] })
  }
}

export function useAddToWatchlist(workId) {
  const { user } = useAuth()
  const invalidate = useInvalidateWatchlist(workId)
  return useMutation({
    mutationFn: () => watchlistApi.addToWatchlist({ userId: user.id, workId }),
    onSuccess: invalidate,
  })
}

export function useUpdateWatchlistEntry(workId) {
  const { user } = useAuth()
  const invalidate = useInvalidateWatchlist(workId)
  return useMutation({
    mutationFn: (patch) => watchlistApi.updateWatchlistEntry({ userId: user.id, workId, patch }),
    onSuccess: invalidate,
  })
}

export function useRemoveFromWatchlist(workId) {
  const { user } = useAuth()
  const invalidate = useInvalidateWatchlist(workId)
  return useMutation({
    mutationFn: () => watchlistApi.removeFromWatchlist({ userId: user.id, workId }),
    onSuccess: invalidate,
  })
}
