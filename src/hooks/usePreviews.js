import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/useAuth'
import * as previewsApi from '../api/previews'

// Gli URL firmati valgono un'ora: i dati si considerano vecchi dopo 30 minuti,
// così un'immagine non resta in pagina con un URL scaduto.
const STALE_TIME = (previewsApi.SIGNED_URL_SECONDS * 1000) / 2

export function usePublishedPreviews(workId, enabled = true) {
  return useQuery({
    queryKey: ['previews', 'published', workId],
    queryFn: () => previewsApi.fetchPublishedPreviews(workId),
    enabled,
    staleTime: STALE_TIME,
  })
}

export function useWorkPreviews(workId) {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['previews', 'work', workId, user?.id],
    queryFn: () => previewsApi.fetchWorkPreviews(workId),
    enabled: Boolean(user),
    staleTime: STALE_TIME,
  })
}

export function useUploadPreview(workId) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (file) => previewsApi.uploadPreview({ workId, userId: user.id, file }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['previews', 'work', workId] })
    },
  })
}

export function useDeletePreview() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (previewId) => previewsApi.deletePreview(previewId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['previews'] })
    },
  })
}

export function usePendingPreviews(enabled) {
  return useQuery({
    queryKey: ['admin', 'pendingPreviews'],
    queryFn: previewsApi.fetchPendingPreviews,
    enabled,
    staleTime: STALE_TIME,
  })
}

export function useReviewPreview() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ previewId, decision, note }) => previewsApi.reviewPreview({ previewId, decision, note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] })
      queryClient.invalidateQueries({ queryKey: ['previews'] })
    },
  })
}
