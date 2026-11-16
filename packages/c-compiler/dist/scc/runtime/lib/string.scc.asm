strlen:
	ld	hl,#2
	add	hl,sp
	call	.gint
	ld	bc,#0
.strlen_loop:
	ld	a,(hl)
	or	a
	jr	z,.strlen_done
	inc	hl
	inc	bc
	jr	.strlen_loop
.strlen_done:
	ld	h,b
	ld	l,c
	ret

memcpy:
	ld	hl,#2
	add	hl,sp
	call	.gint
	ld	b,h
	ld	c,l
	ld	hl,#4
	add	hl,sp
	call	.gint
	push	hl
	ld	hl,#8
	add	hl,sp
	call	.gint
	ex	de,hl
	pop	hl
	push	de
.memcpy_loop:
	ld	a,b
	or	c
	jr	z,.memcpy_done
	ld	a,(hl)
	ld	(de),a
	inc	hl
	inc	de
	dec	bc
	jr	.memcpy_loop
.memcpy_done:
	pop	hl
	ret

; char *memmove(char *destination, char *source, int count)
memmove:
	ld	hl,#2
	add	hl,sp
	call	.gint
	ld	b,h
	ld	c,l
	ld	hl,#4
	add	hl,sp
	call	.gint
	push	hl
	ld	hl,#8
	add	hl,sp
	call	.gint
	ex	de,hl
	pop	hl
	push	de
	push	hl
	or	a
	sbc	hl,de
	pop	hl
	jr	c,.memmove_backward
.memmove_forward_loop:
	ld	a,b
	or	c
	jr	z,.memmove_done
	ld	a,(hl)
	ld	(de),a
	inc	hl
	inc	de
	dec	bc
	jr	.memmove_forward_loop
.memmove_backward:
	ld	a,b
	or	c
	jr	z,.memmove_done
	add	hl,bc
	ex	de,hl
	add	hl,bc
	ex	de,hl
	dec	hl
	dec	de
.memmove_backward_loop:
	ld	a,(hl)
	ld	(de),a
	dec	hl
	dec	de
	dec	bc
	ld	a,b
	or	c
	jr	nz,.memmove_backward_loop
.memmove_done:
	pop	hl
	ret

memset:
	ld	hl,#6
	add	hl,sp
	call	.gint
	ex	de,hl
	ld	hl,#4
	add	hl,sp
	call	.gchar
	ld	a,l
	ld	(mz80_full_memset_value),a
	ld	hl,#2
	add	hl,sp
	call	.gint
	ld	b,h
	ld	c,l
	push	de
.memset_loop:
	ld	a,b
	or	c
	jr	z,.memset_done
	ld	a,(mz80_full_memset_value)
	ld	(de),a
	inc	de
	dec	bc
	jr	.memset_loop
.memset_done:
	pop	hl
	ret
mz80_full_memset_value:
	.db	0

strcmp:
	ld	hl,#4
	add	hl,sp
	call	.gint
	ex	de,hl
	ld	hl,#2
	add	hl,sp
	call	.gint
.strcmp_loop:
	ld	a,(hl)
	ld	c,a
	ld	a,(de)
	sub	c
	jr	nz,.strcmp_done
	ld	a,c
	or	a
	jr	z,.strcmp_done
	inc	de
	inc	hl
	jr	.strcmp_loop
.strcmp_done:
	ld	l,a
	bit	7,a
	jr	z,.strcmp_positive
	ld	h,#255
	ret
.strcmp_positive:
	ld	h,#0
	ret

; int strcoll(char *left, char *right).  The bundled runtime only provides
; the C locale, whose collation order is the bytewise strcmp order.
strcoll:
	jp	strcmp

; int strxfrm(char *destination, char *source, int count).  The C locale
; transform is identity; return the complete source length even if truncated.
strxfrm:
	ld	hl,#2
	add	hl,sp
	call	.gint
	ld	(mz80_full_strxfrm_remaining),hl
	ld	hl,#4
	add	hl,sp
	call	.gint
	ld	(mz80_full_strxfrm_source),hl
	ld	hl,#6
	add	hl,sp
	call	.gint
	ld	(mz80_full_strxfrm_destination),hl
	ld	bc,#0
.strxfrm_loop:
	ld	hl,(mz80_full_strxfrm_source)
	ld	a,(hl)
	or	a
	jr	z,.strxfrm_finish
	ld	(mz80_full_strxfrm_char),a
	inc	hl
	ld	(mz80_full_strxfrm_source),hl
	inc	bc
	ld	hl,(mz80_full_strxfrm_remaining)
	ld	a,h
	or	l
	jr	z,.strxfrm_loop
	dec	hl
	ld	a,h
	or	l
	jr	z,.strxfrm_loop
	ld	(mz80_full_strxfrm_remaining),hl
	ld	de,(mz80_full_strxfrm_destination)
	ld	a,(mz80_full_strxfrm_char)
	ld	(de),a
	inc	de
	ld	(mz80_full_strxfrm_destination),de
	jr	.strxfrm_loop
.strxfrm_finish:
	ld	hl,(mz80_full_strxfrm_remaining)
	ld	a,h
	or	l
	jr	z,.strxfrm_return
	ld	de,(mz80_full_strxfrm_destination)
	xor	a
	ld	(de),a
.strxfrm_return:
	ld	h,b
	ld	l,c
	ret
mz80_full_strxfrm_remaining:
	.dw	0
mz80_full_strxfrm_source:
	.dw	0
mz80_full_strxfrm_destination:
	.dw	0
mz80_full_strxfrm_char:
	.db	0

memcmp:
	ld	hl,#2
	add	hl,sp
	call	.gint
	ld	b,h
	ld	c,l
	ld	hl,#6
	add	hl,sp
	call	.gint
	ex	de,hl
	ld	hl,#4
	add	hl,sp
	call	.gint
.memcmp_loop:
	ld	a,b
	or	c
	jr	z,.memcmp_equal
	push	bc
	ld	a,(hl)
	ld	b,a
	ld	a,(de)
	sub	b
	pop	bc
	jr	nz,.memcmp_done
	inc	de
	inc	hl
	dec	bc
	jr	.memcmp_loop
.memcmp_equal:
	xor	a
.memcmp_done:
	ld	l,a
	bit	7,a
	jr	z,.memcmp_positive
	ld	h,#255
	ret
.memcmp_positive:
	ld	h,#0
	ret

strcpy:
	ld	hl,#4
	add	hl,sp
	call	.gint
	ex	de,hl
	push	de
	ld	hl,#4
	add	hl,sp
	call	.gint
.strcpy_loop:
	ld	a,(hl)
	ld	(de),a
	inc	hl
	inc	de
	or	a
	jr	nz,.strcpy_loop
	pop	hl
	ret

; char *strcat(char *destination, char *source)
strcat:
	ld	hl,#2
	add	hl,sp
	call	.gint
	push	hl
	ld	hl,#6
	add	hl,sp
	call	.gint
	ex	de,hl
	pop	hl
	push	de
.strcat_find_end:
	ld	a,(de)
	or	a
	jr	z,.strcat_copy_source
	inc	de
	jr	.strcat_find_end
.strcat_copy_source:
.strcat_copy_loop:
	ld	a,(hl)
	ld	(de),a
	inc	hl
	inc	de
	or	a
	jr	nz,.strcat_copy_loop
	pop	hl
	ret

; char *strncat(char *destination, char *source, int count)
; Copy at most count source bytes, then always restore destination's NUL terminator.
strncat:
	ld	hl,#2
	add	hl,sp
	call	.gint
	ld	b,h
	ld	c,l
	ld	hl,#4
	add	hl,sp
	call	.gint
	push	hl
	ld	hl,#8
	add	hl,sp
	call	.gint
	ex	de,hl
	pop	hl
	push	de
.strncat_find_end:
	ld	a,(de)
	or	a
	jr	z,.strncat_copy_loop
	inc	de
	jr	.strncat_find_end
.strncat_copy_loop:
	ld	a,b
	or	c
	jr	z,.strncat_terminate
	ld	a,(hl)
	or	a
	jr	z,.strncat_terminate
	ld	(de),a
	inc	hl
	inc	de
	dec	bc
	jr	.strncat_copy_loop
.strncat_terminate:
	xor	a
	ld	(de),a
	pop	hl
	ret

; char *strncpy(char *destination, char *source, int count)
strncpy:
	ld	hl,#2
	add	hl,sp
	call	.gint
	ld	b,h
	ld	c,l
	ld	hl,#4
	add	hl,sp
	call	.gint
	push	hl
	ld	hl,#8
	add	hl,sp
	call	.gint
	ex	de,hl
	pop	hl
	push	de
.strncpy_copy_loop:
	ld	a,b
	or	c
	jr	z,.strncpy_done
	ld	a,(hl)
	ld	(de),a
	inc	de
	dec	bc
	or	a
	jr	z,.strncpy_pad_loop
	inc	hl
	jr	.strncpy_copy_loop
.strncpy_pad_loop:
	ld	a,b
	or	c
	jr	z,.strncpy_done
	xor	a
	ld	(de),a
	inc	de
	dec	bc
	jr	.strncpy_pad_loop
.strncpy_done:
	pop	hl
	ret

; int strncmp(char *left, char *right, int count)
strncmp:
	ld	hl,#2
	add	hl,sp
	call	.gint
	ld	b,h
	ld	c,l
	ld	hl,#6
	add	hl,sp
	call	.gint
	ex	de,hl
	ld	hl,#4
	add	hl,sp
	call	.gint
.strncmp_loop:
	ld	a,b
	or	c
	jr	z,.strncmp_equal
	push	bc
	ld	a,(hl)
	ld	b,a
	ld	a,(de)
	sub	b
	pop	bc
	jr	nz,.strncmp_done
	ld	a,(hl)
	or	a
	jr	z,.strncmp_equal
	inc	hl
	inc	de
	dec	bc
	jr	.strncmp_loop
.strncmp_equal:
	xor	a
.strncmp_done:
	ld	l,a
	bit	7,a
	jr	z,.strncmp_positive
	ld	h,#255
	ret
.strncmp_positive:
	ld	h,#0
	ret

; char *strchr(char *text, int ch)
strchr:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	b,l
	ld	hl,#4
	add	hl,sp
	call	.gint
.strchr_loop:
	ld	a,(hl)
	cp	b
	jr	z,.strchr_found
	or	a
	jr	z,.strchr_missing
	inc	hl
	jr	.strchr_loop
.strchr_found:
	ret
.strchr_missing:
	ld	h,#0
	ld	l,#0
	ret

; char *strrchr(char *text, int ch)
strrchr:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	b,l
	ld	de,#0
	ld	hl,#4
	add	hl,sp
	call	.gint
.strrchr_loop:
	ld	a,(hl)
	cp	b
	jr	nz,.strrchr_next
	push	hl
	pop	de
.strrchr_next:
	ld	a,(hl)
	or	a
	jr	z,.strrchr_done
	inc	hl
	jr	.strrchr_loop
.strrchr_done:
	ex	de,hl
	ret

; char *strstr(char *haystack, char *needle)
strstr:
	ld	hl,#2
	add	hl,sp
	call	.gint
	ld	(mz80_full_strstr_needle),hl
	ld	a,(hl)
	or	a
	jr	z,.strstr_empty_needle
	ld	hl,#4
	add	hl,sp
	call	.gint
	ld	(mz80_full_strstr_cursor),hl
.strstr_outer:
	ld	hl,(mz80_full_strstr_cursor)
	ld	a,(hl)
	or	a
	jr	z,.strstr_missing
	ld	(mz80_full_strstr_candidate),hl
	ld	de,(mz80_full_strstr_needle)
.strstr_inner:
	ld	a,(de)
	or	a
	jr	z,.strstr_found
	ld	hl,(mz80_full_strstr_candidate)
	ld	b,(hl)
	cp	b
	jr	nz,.strstr_advance
	inc	de
	inc	hl
	ld	(mz80_full_strstr_candidate),hl
	jr	.strstr_inner
.strstr_advance:
	ld	hl,(mz80_full_strstr_cursor)
	inc	hl
	ld	(mz80_full_strstr_cursor),hl
	jr	.strstr_outer
.strstr_empty_needle:
	ld	hl,#4
	add	hl,sp
	jp	.gint
.strstr_found:
	ld	hl,(mz80_full_strstr_cursor)
	ret
.strstr_missing:
	ld	h,#0
	ld	l,#0
	ret
mz80_full_strstr_needle:
	.dw	0
mz80_full_strstr_cursor:
	.dw	0
mz80_full_strstr_candidate:
	.dw	0

; char *strpbrk(char *text, char *accept)
strpbrk:
	ld	hl,#2
	add	hl,sp
	call	.gint
	ld	(mz80_full_strpbrk_accept),hl
	ld	hl,#4
	add	hl,sp
	call	.gint
.strpbrk_text_loop:
	ld	a,(hl)
	or	a
	jr	z,.strpbrk_missing
	ld	c,a
	ld	de,(mz80_full_strpbrk_accept)
.strpbrk_accept_loop:
	ld	a,(de)
	or	a
	jr	z,.strpbrk_next_text
	cp	c
	jr	z,.strpbrk_found
	inc	de
	jr	.strpbrk_accept_loop
.strpbrk_next_text:
	inc	hl
	jr	.strpbrk_text_loop
.strpbrk_found:
	ret
.strpbrk_missing:
	ld	h,#0
	ld	l,#0
	ret
mz80_full_strpbrk_accept:
	.dw	0

; int strspn(char *text, char *accept)
strspn:
	ld	hl,#2
	add	hl,sp
	call	.gint
	ld	(mz80_full_span_accept),hl
	ld	hl,#4
	add	hl,sp
	call	.gint
	ld	bc,#0
.strspn_text_loop:
	ld	a,(hl)
	or	a
	jr	z,.strspn_done
	push	bc
	ld	c,a
	ld	de,(mz80_full_span_accept)
.strspn_accept_loop:
	ld	a,(de)
	or	a
	jr	z,.strspn_not_accepted
	cp	c
	jr	z,.strspn_accepted
	inc	de
	jr	.strspn_accept_loop
.strspn_accepted:
	pop	bc
	inc	hl
	inc	bc
	jr	.strspn_text_loop
.strspn_not_accepted:
	pop	bc
.strspn_done:
	ld	h,b
	ld	l,c
	ret

; int strcspn(char *text, char *reject)
strcspn:
	ld	hl,#2
	add	hl,sp
	call	.gint
	ld	(mz80_full_span_accept),hl
	ld	hl,#4
	add	hl,sp
	call	.gint
	ld	bc,#0
.strcspn_text_loop:
	ld	a,(hl)
	or	a
	jr	z,.strcspn_done
	push	bc
	ld	c,a
	ld	de,(mz80_full_span_accept)
.strcspn_reject_loop:
	ld	a,(de)
	or	a
	jr	z,.strcspn_not_rejected
	cp	c
	jr	z,.strcspn_rejected
	inc	de
	jr	.strcspn_reject_loop
.strcspn_not_rejected:
	pop	bc
	inc	hl
	inc	bc
	jr	.strcspn_text_loop
.strcspn_rejected:
	pop	bc
.strcspn_done:
	ld	h,b
	ld	l,c
	ret
mz80_full_span_accept:
	.dw	0

; char *strtok(char *text, char *delimiters).  Like the C89 function, this
; retains continuation state and is not reentrant.
strtok:
	ld	hl,#2
	add	hl,sp
	call	.gint
	ld	(mz80_full_strtok_delimiters),hl
	ld	hl,#4
	add	hl,sp
	call	.gint
	ld	a,h
	or	l
	jr	z,.strtok_continue
	ld	(mz80_full_strtok_cursor),hl
.strtok_continue:
	ld	hl,(mz80_full_strtok_cursor)
	ld	a,h
	or	l
	jr	z,.strtok_missing
.strtok_skip_delimiters:
	ld	hl,(mz80_full_strtok_cursor)
	ld	a,(hl)
	or	a
	jr	z,.strtok_missing
	call	mz80_full_strtok_is_delimiter
	or	a
	jr	z,.strtok_start
	ld	hl,(mz80_full_strtok_cursor)
	inc	hl
	ld	(mz80_full_strtok_cursor),hl
	jr	.strtok_skip_delimiters
.strtok_start:
	ld	hl,(mz80_full_strtok_cursor)
	ld	(mz80_full_strtok_token),hl
.strtok_scan_token:
	ld	hl,(mz80_full_strtok_cursor)
	ld	a,(hl)
	or	a
	jr	z,.strtok_end_of_text
	call	mz80_full_strtok_is_delimiter
	or	a
	jr	nz,.strtok_split
	ld	hl,(mz80_full_strtok_cursor)
	inc	hl
	ld	(mz80_full_strtok_cursor),hl
	jr	.strtok_scan_token
.strtok_split:
	ld	hl,(mz80_full_strtok_cursor)
	xor	a
	ld	(hl),a
	inc	hl
	ld	(mz80_full_strtok_cursor),hl
	jr	.strtok_return_token
.strtok_end_of_text:
	ld	hl,#0
	ld	(mz80_full_strtok_cursor),hl
.strtok_return_token:
	ld	hl,(mz80_full_strtok_token)
	ret
.strtok_missing:
	ld	h,#0
	ld	l,#0
	ret

; A is the candidate byte.  Return A=1 if it appears in the delimiter string.
mz80_full_strtok_is_delimiter:
	ld	b,a
	ld	de,(mz80_full_strtok_delimiters)
.strtok_delimiter_loop:
	ld	a,(de)
	or	a
	jr	z,.strtok_not_delimiter
	cp	b
	jr	z,.strtok_delimiter
	inc	de
	jr	.strtok_delimiter_loop
.strtok_delimiter:
	ld	a,#1
	ret
.strtok_not_delimiter:
	xor	a
	ret
mz80_full_strtok_delimiters:
	.dw	0
mz80_full_strtok_cursor:
	.dw	0
mz80_full_strtok_token:
	.dw	0
