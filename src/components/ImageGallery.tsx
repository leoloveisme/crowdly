import React, { useEffect, useState } from "react";
import EditableText from "@/components/EditableText";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from "@/components/ui/carousel";
import { Button } from "@/components/ui/button";
import { Check, X, Trash2 } from "lucide-react";
import TagBadge from "@/components/TagBadge";
import {
  listGalleryImages,
  updateGalleryImage,
  deleteGalleryImage,
  type GalleryImage,
  type GalleryImageKind,
} from "@/lib/galleryApi";

interface ImageGalleryProps {
  storyTitleId: string;
  kindFilter?: GalleryImageKind[];
  currentUserId?: string | null;
  canModerate?: boolean;
  idPrefix?: string;
  // Bump this to force a refetch (e.g. right after a GalleryUpload completes).
  refreshToken?: number;
}

const ImageGallery: React.FC<ImageGalleryProps> = ({
  storyTitleId,
  kindFilter,
  currentUserId,
  canModerate = false,
  idPrefix = "image-gallery",
  refreshToken,
}) => {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listGalleryImages(storyTitleId)
      .then((rows) => {
        if (cancelled) return;
        setImages(kindFilter ? rows.filter((r) => kindFilter.includes(r.kind)) : rows);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load gallery.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // kindFilter is intentionally excluded — pass a stable array from the caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyTitleId, refreshToken]);

  const handleModerate = async (id: string, status: "approved" | "rejected") => {
    try {
      await updateGalleryImage(id, { status });
      setImages((prev) => prev.map((img) => (img.id === id ? { ...img, status } : img)));
    } catch {
      // Best-effort — a failed moderation click just leaves the item as-is;
      // the next full reload will reflect the server's actual state.
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteGalleryImage(id);
      setImages((prev) => prev.filter((img) => img.id !== id));
      setOpenIndex(null);
    } catch {
      // Best-effort, same as handleModerate.
    }
  };

  if (loading) {
    return (
      <EditableText id={`${idPrefix}-loading`} as="div" className="text-sm text-gray-500">
        Loading gallery...
      </EditableText>
    );
  }
  if (error) {
    return <div className="text-sm text-red-600">{error}</div>;
  }
  if (images.length === 0) {
    return (
      <EditableText id={`${idPrefix}-empty`} as="div" className="text-sm text-gray-500 italic">
        No images yet.
      </EditableText>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {images.map((image, idx) => (
          <button
            key={image.id}
            type="button"
            onClick={() => setOpenIndex(idx)}
            className="relative aspect-square rounded-md overflow-hidden bg-gray-100 dark:bg-gray-800 group"
          >
            <img
              src={image.image_url}
              alt={image.caption ?? ""}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            />
            {image.status !== "approved" && (
              <span className="absolute top-1 left-1 rounded-full bg-amber-500 text-white text-[10px] px-1.5 py-0.5">
                <EditableText id={`${idPrefix}-pending-badge`}>Pending review</EditableText>
              </span>
            )}
          </button>
        ))}
      </div>

      <Dialog open={openIndex !== null} onOpenChange={(open) => !open && setOpenIndex(null)}>
        <DialogContent className="max-w-3xl">
          <DialogTitle className="sr-only">
            <EditableText id={`${idPrefix}-lightbox-title`}>Gallery image</EditableText>
          </DialogTitle>
          {openIndex !== null && (
            <Carousel opts={{ startIndex: openIndex }}>
              <CarouselContent>
                {images.map((image) => (
                  <CarouselItem key={image.id} className="flex flex-col items-center gap-3">
                    <img
                      src={image.image_url}
                      alt={image.caption ?? ""}
                      className="max-h-[70vh] w-auto mx-auto rounded-md object-contain"
                    />
                    {image.caption && (
                      <p className="text-sm text-gray-700 dark:text-gray-200">{image.caption}</p>
                    )}
                    {image.tags && image.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 justify-center">
                        {image.tags.map((tag) => (
                          <TagBadge key={tag} tag={tag} />
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      {canModerate && image.status === "pending" && (
                        <>
                          <Button type="button" size="sm" variant="outline" onClick={() => handleModerate(image.id, "approved")}>
                            <Check className="h-3 w-3 mr-1" />
                            <EditableText id={`${idPrefix}-approve`}>Approve</EditableText>
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => handleModerate(image.id, "rejected")}>
                            <X className="h-3 w-3 mr-1" />
                            <EditableText id={`${idPrefix}-reject`}>Reject</EditableText>
                          </Button>
                        </>
                      )}
                      {(canModerate || currentUserId === image.uploaded_by) && (
                        <Button type="button" size="sm" variant="outline" onClick={() => handleDelete(image.id)}>
                          <Trash2 className="h-3 w-3 mr-1" />
                          <EditableText id={`${idPrefix}-delete`}>Delete</EditableText>
                        </Button>
                      )}
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious />
              <CarouselNext />
            </Carousel>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ImageGallery;
