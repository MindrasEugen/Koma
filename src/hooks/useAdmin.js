import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/useAuth'
import * as adminApi from '../api/admin'

export function useIsAdmin() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['isAdmin', user?.id],
    queryFn: adminApi.isAdmin,
    enabled: Boolean(user),
  })
}

export function usePendingWorks(enabled) {
  return useQuery({
    queryKey: ['admin', 'pendingWorks'],
    queryFn: adminApi.fetchPendingWorks,
    enabled,
  })
}

export function useHiddenWorks(enabled) {
  return useQuery({
    queryKey: ['admin', 'hiddenWorks'],
    queryFn: adminApi.fetchHiddenWorks,
    enabled,
  })
}

export function useDisputes(enabled) {
  return useQuery({
    queryKey: ['admin', 'disputes'],
    queryFn: adminApi.fetchDisputes,
    enabled,
  })
}

export function useManualReviewClaims(enabled) {
  return useQuery({
    queryKey: ['admin', 'manualReviewClaims'],
    queryFn: adminApi.fetchManualReviewClaims,
    enabled,
  })
}

export function useReviewWork() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ workId, decision, note }) =>
      adminApi.reviewWork({ workId, decision, note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] })
      queryClient.invalidateQueries({ queryKey: ['comics'] })
    },
  })
}

export function useResolveDispute() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ keepClaimId, note }) =>
      adminApi.resolveDispute({ keepClaimId, note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] })
      queryClient.invalidateQueries({ queryKey: ['comics'] })
    },
  })
}

export function useDecideClaim() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ claimId, approve, note }) =>
      adminApi.decideClaim({ claimId, approve, note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] })
      queryClient.invalidateQueries({ queryKey: ['comics'] })
    },
  })
}

export function useDeleteWork() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (workId) => adminApi.deleteWork(workId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] })
      queryClient.invalidateQueries({ queryKey: ['comics'] })
      queryClient.invalidateQueries({ queryKey: ['genres'] })
      queryClient.invalidateQueries({ queryKey: ['myWorks'] })
    },
  })
}
