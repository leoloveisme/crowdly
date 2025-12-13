
import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  MessageSquare, 
  Heart, 
  Reply, 
  Trash2, 
  FolderUp, 
  FileSymlink, 
  Copy, 
  MoreVertical, 
  Send 
} from "lucide-react";
import EditableText from "@/components/EditableText";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Message {
  id: number;
  user: {
    name: string;
    avatar?: string;
  };
  content: string;
  date: string;
  liked: boolean;
  likes: number;
}

const initialMessages: Message[] = [
  {
    id: 1,
    user: {
      name: "John Doe",
      avatar: ""
    },
    content: "This is a message from another user discussing the story development",
    date: "2023-05-01 14:30",
    liked: false,
    likes: 5
  },
  {
    id: 2,
    user: {
      name: "Jane Smith",
      avatar: ""
    },
    content: "I really enjoyed the plot twist in chapter 3, it was unexpected but fit perfectly with the character development",
    date: "2023-05-02 09:15",
    liked: true,
    likes: 3
  }
];

const initialComments: Message[] = [
  {
    id: 3,
    user: {
      name: "Alex Johnson",
      avatar: ""
    },
    content: "This is a comment on a specific part of the story, highlighting a detail that was particularly well written",
    date: "2023-05-03 11:45",
    liked: false,
    likes: 2
  },
  {
    id: 4,
    user: {
      name: "Sam Wilson",
      avatar: ""
    },
    content: "I think the pacing in this section could be improved to build more tension",
    date: "2023-05-03 16:20",
    liked: false,
    likes: 1
  }
];

const CommunicationsSection = () => {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [comments, setComments] = useState<Message[]>(initialComments);
  const [newMessage, setNewMessage] = useState('');
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyContent, setReplyContent] = useState('');
  
  const handleLike = (id: number, type: 'message' | 'comment') => {
    if (type === 'message') {
      setMessages(prev => prev.map(message => {
        if (message.id === id) {
          return {
            ...message,
            liked: !message.liked,
            likes: message.liked ? message.likes - 1 : message.likes + 1
          };
        }
        return message;
      }));
    } else {
      setComments(prev => prev.map(comment => {
        if (comment.id === id) {
          return {
            ...comment,
            liked: !comment.liked,
            likes: comment.liked ? comment.likes - 1 : comment.likes + 1
          };
        }
        return comment;
      }));
    }
  };
  
  const handleDelete = (id: number, type: 'message' | 'comment') => {
    if (type === 'message') {
      setMessages(prev => prev.filter(message => message.id !== id));
    } else {
      setComments(prev => prev.filter(comment => comment.id !== id));
    }
  };
  
  const handleReply = (id: number) => {
    setReplyingTo(replyingTo === id ? null : id);
    setReplyContent('');
  };
  
  const submitReply = (id: number, type: 'message' | 'comment') => {
    if (!replyContent.trim()) return;
    
    const newReply = {
      id: Date.now(),
      user: {
        name: "You",
        avatar: ""
      },
      content: `Replying to #${id}: ${replyContent}`,
      date: new Date().toISOString().split('T')[0] + ' ' + new Date().toTimeString().slice(0, 5),
      liked: false,
      likes: 0
    };
    
    if (type === 'message') {
      setMessages(prev => [...prev, newReply]);
    } else {
      setComments(prev => [...prev, newReply]);
    }
    
    setReplyingTo(null);
    setReplyContent('');
  };
  
  const handleSendMessage = () => {
    if (!newMessage.trim()) return;
    
    const message = {
      id: Date.now(),
      user: {
        name: "You",
        avatar: ""
      },
      content: newMessage,
      date: new Date().toISOString().split('T')[0] + ' ' + new Date().toTimeString().slice(0, 5),
      liked: false,
      likes: 0
    };
    
    setMessages(prev => [...prev, message]);
    setNewMessage('');
  };
  
  const handleSendComment = () => {
    if (!newComment.trim()) return;
    
    const comment = {
      id: Date.now(),
      user: {
        name: "You",
        avatar: ""
      },
      content: newComment,
      date: new Date().toISOString().split('T')[0] + ' ' + new Date().toTimeString().slice(0, 5),
      liked: false,
      likes: 0
    };
    
    setComments(prev => [...prev, comment]);
    setNewComment('');
  };
  
  const MessageItem = ({ message, type }: { message: Message, type: 'message' | 'comment' }) => {
    const isReplying = replyingTo === message.id;
    
    const getInitials = (name: string) => {
      return name.split(' ').map(n => n[0]).join('').toUpperCase();
    };
    
    return (
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="flex justify-between items-start">
            <div className="flex items-start space-x-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={message.user.avatar} />
                <AvatarFallback className="bg-purple-100 text-purple-600">
                  {getInitials(message.user.name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center">
                  <h3 className="font-medium">{message.user.name}</h3>
                  <span className="text-xs text-gray-500 ml-2">{message.date}</span>
                </div>
                <p className="text-gray-700 mt-1">{message.content}</p>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleLike(message.id, type)}>
                  <Heart className={`h-4 w-4 mr-2 ${message.liked ? 'text-red-500' : ''}`} />
                  Like{message.liked ? 'd' : ''}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleReply(message.id)}>
                  <Reply className="h-4 w-4 mr-2" />
                  Reply
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleDelete(message.id, type)}>
                  <Trash2 className="h-4 w-4 mr-2 text-red-500" />
                  Delete
                </DropdownMenuItem>
                {type === 'message' && (
                  <DropdownMenuItem>
                    <FolderUp className="h-4 w-4 mr-2" />
                    Move to folder
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem>
                  <FileSymlink className="h-4 w-4 mr-2" />
                  Clone into chapter
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy into branch
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          
          <div className="flex items-center mt-3 space-x-2">
            <Button 
              variant="ghost" 
              size="sm" 
              className={`text-sm px-2 py-0 h-auto ${message.liked ? 'text-red-500' : 'text-gray-500'}`}
              onClick={() => handleLike(message.id, type)}
            >
              <Heart className={`h-4 w-4 mr-1 ${message.liked ? 'fill-red-500' : ''}`} />
              {message.likes}
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-sm px-2 py-0 h-auto text-gray-500"
              onClick={() => handleReply(message.id)}
            >
              <Reply className="h-4 w-4 mr-1" />
              Reply
            </Button>
          </div>
          
          {isReplying && (
            <div className="mt-3 flex items-center space-x-2">
              <Input 
                placeholder="Write a reply..."
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                className="flex-grow"
              />
              <Button 
                size="sm" 
                onClick={() => submitReply(message.id, type)}
                disabled={!replyContent.trim()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold mb-6 text-[#1A1F2C]">
        <EditableText id="communication">
          Communication
        </EditableText>
      </h1>
      
      <Tabs defaultValue="discussions" className="w-full">
        <TabsList className="grid grid-cols-2 w-full md:w-[400px] mb-4">
          <TabsTrigger value="discussions" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            <EditableText id="discussions">
              Discussions / Messages
            </EditableText>
          </TabsTrigger>
          <TabsTrigger value="comments" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            <EditableText id="comments">
              Comments
            </EditableText>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="discussions" className="space-y-4">
          <div className="flex items-center space-x-2 mb-4">
            <Input 
              placeholder="Write a message..." 
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              className="flex-grow"
            />
            <Button onClick={handleSendMessage} disabled={!newMessage.trim()}>
              <Send className="h-4 w-4 mr-2" />
              Send
            </Button>
          </div>
          
          {messages.length > 0 ? (
            <div>
              {messages.map(message => (
                <MessageItem key={message.id} message={message} type="message" />
              ))}
            </div>
          ) : (
            <p className="text-center text-gray-500 my-8">
              <EditableText id="no-messages">
                No messages yet. Start a discussion!
              </EditableText>
            </p>
          )}
        </TabsContent>
        
        <TabsContent value="comments" className="space-y-4">
          <div className="flex items-center space-x-2 mb-4">
            <Input 
              placeholder="Write a comment..." 
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="flex-grow"
            />
            <Button onClick={handleSendComment} disabled={!newComment.trim()}>
              <Send className="h-4 w-4 mr-2" />
              Send
            </Button>
          </div>
          
          {comments.length > 0 ? (
            <div>
              {comments.map(comment => (
                <MessageItem key={comment.id} message={comment} type="comment" />
              ))}
            </div>
          ) : (
            <p className="text-center text-gray-500 my-8">
              <EditableText id="no-comments">
                No comments yet. Be the first to comment!
              </EditableText>
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CommunicationsSection;
