import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/useAuth'
import * as claimsApi from '../api/claims'

export function useMyClaims() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['claims', user?.id],
    queryFn: () => claimsApi.fetchMyClaims(user.id),
    enabled: Boolean(user),
  })
}

export function useClaimForWork(workId) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['claim', user?.id, workId],
    queryFn: () => claimsApi.fetchClaimForWork(user.id, workId),
    enabled: Boolean(user && workId),
  })
}

export function useOpenClaim(workId) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (verificationProfileUrl) =>
      claimsApi.openClaim({ workId, verificationProfileUrl }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claim', user?.id, workId] })
      queryClient.invalidateQueries({ queryKey: ['claims', user?.id] })
    },
  })
}

export function useWithdrawClaim() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (claimId) => claimsApi.withdrawClaim(claimId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claims', user?.id] })
      queryClient.invalidateQueries({ queryKey: ['claim', user?.id] })
    },
  })
}

export function useVerifyClaim(workId) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (claimId) => claimsApi.verifyClaim(claimId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['claim', user?.id, workId] })
      queryClient.invalidateQueries({ queryKey: ['claims', user?.id] })
      if (result.status === 'verified') {
        queryClient.invalidateQueries({ queryKey: ['comic'] })
        queryClient.invalidateQueries({ queryKey: ['myWorks', user?.id] })
      }
    },
  })
}
