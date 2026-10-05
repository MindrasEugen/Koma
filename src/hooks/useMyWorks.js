import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/authContext'
import * as worksApi from '../api/works'

export function useMyWorks() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['myWorks', user?.id],
    queryFn: () => worksApi.fetchMyWorks(user.id),
    enabled: Boolean(user),
  })
}

export function usePublishWork() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (form) => worksApi.publishWork(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myWorks', user?.id] })
    },
  })
}

export function useHideWork() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (workId) => worksApi.hideWork(workId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myWorks', user?.id] })
    },
  })
}
