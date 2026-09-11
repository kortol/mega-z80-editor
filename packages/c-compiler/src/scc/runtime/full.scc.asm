; Profile supplement shared by all bundled full runtimes.  Entry arguments use
; the current TypeScript SCC non-variadic ABI (first argument farthest from SP).
	.globl	memcmp
	.globl	memcpy
	.globl	memmove
	.globl	memset
	.globl	strcmp
	.globl	strcpy
	.globl	strncat
	.globl	strstr
	.globl	strtok
	.globl	strpbrk
	.globl	strspn
	.globl	strcspn
	.globl	strcoll
	.globl	strxfrm
	.globl	mz80_full_strtok_is_delimiter
	.globl	strlen
	.globl	isalpha
	.globl	isdigit
	.globl	islower
	.globl	isspace
	.globl	isupper
	.globl	tolower
	.globl	toupper
	.globl	abs
	.globl	atoi
	.globl	__mz80_assert
	.globl	rand
	.globl	srand
	.globl	printf
	.globl	sprintf
	.globl	mz80_full_memset_value
	.globl	mz80_full_isalpha_a
	.globl	mz80_full_vformat
	.globl	mz80_full_next_arg
	.globl	mz80_full_emit
	.globl	mz80_full_emit_unsigned
	.globl	mz80_full_emit_signed
	.globl	mz80_full_emit_hex_lower
	.globl	mz80_full_emit_hex_upper
	.globl	mz80_full_emit_hex
	.globl	mz80_full_emit_hex_recurse
	.globl	mz80_full_emit_hex_fixed
	.globl	mz80_full_emit_hex_digit
	.globl	mz80_full_format_loop
	.globl	mz80_full_hex_alpha
	.area	_CODE

; int abs(int value)
abs:
	ld	hl,#2
	add	hl,sp
	call	.gint
	bit	7,h
	ret	z
	ld	a,l
	cpl
	ld	l,a
	ld	a,h
	cpl
	ld	h,a
	inc	hl
	ret

; int atoi(char *text).  This intentionally small C89 subset accepts leading
; ASCII space/tab, an optional sign, then decimal digits.
atoi:
	ld	hl,#2
	add	hl,sp
	call	.gint
	ld	(mz80_full_atoi_pointer),hl
	ld	bc,#0
	ld	a,#0
	ld	(mz80_full_atoi_negative),a
.atoi_space:
	ld	hl,(mz80_full_atoi_pointer)
	ld	a,(hl)
	cp	#32
	jr	z,.atoi_skip
	cp	#9
	jr	nz,.atoi_sign
.atoi_skip:
	inc	hl
	ld	(mz80_full_atoi_pointer),hl
	jr	.atoi_space
.atoi_sign:
	cp	#45
	jr	nz,.atoi_plus
	ld	a,#1
	ld	(mz80_full_atoi_negative),a
	inc	hl
	ld	(mz80_full_atoi_pointer),hl
	jr	.atoi_digit
.atoi_plus:
	cp	#43
	jr	nz,.atoi_digit
	inc	hl
	ld	(mz80_full_atoi_pointer),hl
.atoi_digit:
	ld	hl,(mz80_full_atoi_pointer)
	ld	a,(hl)
	sub	#48
	jr	c,.atoi_done
	cp	#10
	jr	nc,.atoi_done
	ld	e,a
	ld	d,#0
	push	de
	ld	h,b
	ld	l,c
	add	hl,hl
	add	hl,hl
	add	hl,bc
	add	hl,hl
	pop	de
	add	hl,de
	ld	b,h
	ld	c,l
	ld	hl,(mz80_full_atoi_pointer)
	inc	hl
	ld	(mz80_full_atoi_pointer),hl
	jr	.atoi_digit
.atoi_done:
	ld	h,b
	ld	l,c
	ld	a,(mz80_full_atoi_negative)
	or	a
	ret	z
	ld	a,l
	cpl
	ld	l,a
	ld	a,h
	cpl
	ld	h,a
	inc	hl
	ret
mz80_full_atoi_negative:
	.db	0
mz80_full_atoi_pointer:
	.dw	0

; assert() is the one supported function-like bundled-header macro.  A false
; condition exits through the selected platform CRT; true evaluates to zero.
__mz80_assert:
	ld	hl,#2
	add	hl,sp
	call	.gint
	ld	a,h
	or	l
	jr	nz,.assert_ok
	ld	hl,#1
	call	exit
.assert_ok:
	ld	hl,#0
	ret

; int rand(void) / void srand(int).  This is a deterministic 15-bit LCG for
; the fixed Z80 ABI, not a cryptographic random source.
rand:
	ld	hl,(mz80_full_rand_seed)
	ld	d,h
	ld	e,l
	add	hl,hl
	add	hl,hl
	add	hl,de
	inc	hl
	res	7,h
	ld	(mz80_full_rand_seed),hl
	ret
srand:
	ld	hl,#2
	add	hl,sp
	call	.gint
	res	7,h
	ld	(mz80_full_rand_seed),hl
	ret
mz80_full_rand_seed:
	.dw	1

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

isalpha:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	a,l
	call	mz80_full_isalpha_a
	ret

isalnum:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	a,l
	cp	#48
	jr	c,.isalnum_upper
	cp	#58
	jr	c,.isalnum_true
.isalnum_upper:
	cp	#65
	jr	c,.isalnum_lower
	cp	#91
	jr	c,.isalnum_true
.isalnum_lower:
	cp	#97
	jr	c,.isalnum_false
	cp	#123
	jr	c,.isalnum_true
.isalnum_false:
	ld	hl,#0
	ret
.isalnum_true:
	ld	hl,#1
	ret

iscntrl:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	a,l
	cp	#32
	jr	c,.iscntrl_true
	cp	#127
	jr	z,.iscntrl_true
	ld	hl,#0
	ret
.iscntrl_true:
	ld	hl,#1
	ret
isdigit:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	a,l
	cp	#48
	jr	c,.isdigit_false
	cp	#58
	jr	nc,.isdigit_false
	ld	hl,#1
	ret
.isdigit_false:
	ld	hl,#0
	ret

isgraph:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	a,l
	cp	#33
	jr	c,.isgraph_false
	cp	#127
	jr	c,.isgraph_true
.isgraph_false:
	ld	hl,#0
	ret
.isgraph_true:
	ld	hl,#1
	ret
islower:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	a,l
	cp	#97
	jr	c,.islower_false
	cp	#123
	jr	nc,.islower_false
	ld	hl,#1
	ret
.islower_false:
	ld	hl,#0
	ret

isprint:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	a,l
	cp	#32
	jr	c,.isprint_false
	cp	#127
	jr	c,.isprint_true
.isprint_false:
	ld	hl,#0
	ret
.isprint_true:
	ld	hl,#1
	ret

ispunct:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	a,l
	cp	#33
	jr	c,.ispunct_false
	cp	#48
	jr	c,.ispunct_true
	cp	#58
	jr	c,.ispunct_false
	cp	#65
	jr	c,.ispunct_true
	cp	#91
	jr	c,.ispunct_false
	cp	#97
	jr	c,.ispunct_true
	cp	#123
	jr	c,.ispunct_false
	cp	#127
	jr	c,.ispunct_true
.ispunct_false:
	ld	hl,#0
	ret
.ispunct_true:
	ld	hl,#1
	ret
isupper:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	a,l
	cp	#65
	jr	c,.isupper_false
	cp	#91
	jr	nc,.isupper_false
	ld	hl,#1
	ret
.isupper_false:
	ld	hl,#0
	ret
isspace:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	a,l
	cp	#32
	jr	z,.isspace_true
	cp	#9
	jr	c,.isspace_false
	cp	#14
	jr	nc,.isspace_false
.isspace_true:
	ld	hl,#1
	ret
.isspace_false:
	ld	hl,#0
	ret

isxdigit:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	a,l
	cp	#48
	jr	c,.isxdigit_upper
	cp	#58
	jr	c,.isxdigit_true
.isxdigit_upper:
	cp	#65
	jr	c,.isxdigit_lower
	cp	#71
	jr	c,.isxdigit_true
.isxdigit_lower:
	cp	#97
	jr	c,.isxdigit_false
	cp	#103
	jr	c,.isxdigit_true
.isxdigit_false:
	ld	hl,#0
	ret
.isxdigit_true:
	ld	hl,#1
	ret
tolower:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	a,l
	cp	#65
	jr	c,.char
	cp	#91
	jr	nc,.char
	add	a,#32
.char:
	ld	l,a
	ld	h,#0
	ret
toupper:
	ld	hl,#2
	add	hl,sp
	call	.gchar
	ld	a,l
	cp	#97
	jr	c,.char
	cp	#123
	jr	nc,.char
	sub	#32
	jr	.char
mz80_full_isalpha_a:
	cp	#65
	jr	c,.alpha_lower
	cp	#91
	jr	c,.true
.alpha_lower:
	cp	#97
	jr	c,.false
	cp	#123
	jr	nc,.false
.true:
	ld	hl,#1
	ret
.false:
	ld	hl,#0
	ret

; printf and sprintf use the TS compiler's internal variadic ABI: slots are
; pushed right-to-left. IY is the format cursor, IX the next argument slot,
; and DE is the optional sprintf cursor (zero means console output).
printf:
	push	ix
	push	iy
	ld	hl,#6
	add	hl,sp
	call	.gint
	push	hl
	pop	iy
	ld	hl,#8
	add	hl,sp
	push	hl
	pop	ix
	ld	de,#0
	call	mz80_full_vformat
	pop	iy
	pop	ix
	ld	hl,#0
	ret

sprintf:
	push	ix
	push	iy
	ld	hl,#6
	add	hl,sp
	call	.gint
	ex	de,hl
	push	de
	ld	hl,#10
	add	hl,sp
	call	.gint
	push	hl
	pop	iy
	ld	hl,#12
	add	hl,sp
	push	hl
	pop	ix
	call	mz80_full_vformat
	xor	a
	ld	(de),a
	pop	hl
	pop	iy
	pop	ix
	ret

mz80_full_vformat:
mz80_full_format_loop:
	push	iy
	pop	hl
	ld	a,(hl)
	inc	iy
	or	a
	ret	z
	cp	#37
	jr	z,.format_percent
	call	mz80_full_emit
	jp	mz80_full_format_loop
.format_percent:
	push	iy
	pop	hl
	ld	a,(hl)
	inc	iy
	cp	#37
	jr	z,.format_emit
	cp	#99
	jr	z,.format_char
	cp	#115
	jr	z,.format_string
	cp	#100
	jr	z,.format_signed
	cp	#117
	jr	z,.format_unsigned
	cp	#120
	jr	z,.format_hex_lower
	cp	#88
	jr	z,.format_hex_upper
	cp	#112
	jr	z,.format_pointer
	ld	a,#63
	jr	.format_emit
.format_char:
	call	mz80_full_next_arg
	ld	a,l
	jr	.format_emit
.format_string:
	call	mz80_full_next_arg
.format_string_loop:
	ld	a,(hl)
	inc	hl
	or	a
	jr	z,mz80_full_format_loop
	push	hl
	call	mz80_full_emit
	pop	hl
	jr	.format_string_loop
.format_signed:
	call	mz80_full_next_arg
	call	mz80_full_emit_signed
	jp	mz80_full_format_loop
.format_unsigned:
	call	mz80_full_next_arg
	call	mz80_full_emit_unsigned
	jp	mz80_full_format_loop
.format_hex_lower:
	call	mz80_full_next_arg
	call	mz80_full_emit_hex_lower
	jp	mz80_full_format_loop
.format_hex_upper:
	call	mz80_full_next_arg
	call	mz80_full_emit_hex_upper
	jp	mz80_full_format_loop
.format_pointer:
	call	mz80_full_next_arg
	push	hl
	ld	a,#48
	call	mz80_full_emit
	ld	a,#120
	call	mz80_full_emit
	pop	hl
	ld	a,#97
	ld	(mz80_full_hex_alpha),a
	call	mz80_full_emit_hex_fixed
	jp	mz80_full_format_loop
.format_emit:
	call	mz80_full_emit
	jp	mz80_full_format_loop

mz80_full_next_arg:
	push	ix
	pop	hl
	ld	a,(hl)
	inc	hl
	ld	h,(hl)
	ld	l,a
	inc	ix
	inc	ix
	ret

; Emit A to DE when sprintf is active, otherwise call the platform putchar.
mz80_full_emit:
	push	af
	ld	a,d
	or	e
	jr	z,.emit_console
	pop	af
	ld	(de),a
	inc	de
	ret
.emit_console:
	pop	af
	push	de
	ld	l,a
	ld	h,#0
	push	hl
	call	putchar
	pop	bc
	pop	de
	ret

; HL is an unsigned 16-bit integer. Binary long division keeps the formatter
; bounded for every 16-bit value (including signed -1 after negation).
mz80_full_emit_unsigned:
	push	de
	ld	de,#0
	ld	c,#0
	ld	b,#16
.unsigned_divide:
	add	hl,hl
	rl	c
	ld	a,c
	cp	#10
	jr	c,.unsigned_quotient_zero
	sub	#10
	ld	c,a
	scf
	jr	.unsigned_quotient_bit
.unsigned_quotient_zero:
	or	a
.unsigned_quotient_bit:
	rl	e
	rl	d
	djnz	.unsigned_divide
	ld	h,d
	ld	l,e
	pop	de
	push	bc
	ld	a,h
	or	l
	jr	z,.unsigned_emit_remainder
	call	mz80_full_emit_unsigned
.unsigned_emit_remainder:
	pop	bc
	ld	a,c
	add	a,#48
	call	mz80_full_emit
	ret

mz80_full_emit_signed:
	bit	7,h
	jr	z,.signed_positive
	push	hl
	ld	a,#45
	call	mz80_full_emit
	pop	hl
	xor	a
	sub	l
	ld	l,a
	ld	a,#0
	sbc	a,h
	ld	h,a
.signed_positive:
	call	mz80_full_emit_unsigned
	ret

; Hexadecimal output uses the same quotient/remainder recursion as decimal.
; The two entry points keep case selection out of the public formatter state.
mz80_full_emit_hex_lower:
	ld	a,#97
	jp	mz80_full_emit_hex

mz80_full_emit_hex_upper:
	ld	a,#65
mz80_full_emit_hex:
	ld	(mz80_full_hex_alpha),a
	jr	mz80_full_emit_hex_recurse

mz80_full_emit_hex_recurse:
	push	de
	ld	bc,#0
	ld	de,#16
.hex_divide:
	ld	a,h
	or	a
	jr	nz,.hex_subtract
	ld	a,l
	cp	#16
	jr	c,.hex_remainder
.hex_subtract:
	or	a
	sbc	hl,de
	inc	bc
	jr	.hex_divide
.hex_remainder:
	pop	de
	push	hl
	ld	h,b
	ld	l,c
	ld	a,h
	or	l
	jr	z,.hex_emit_remainder
	call	mz80_full_emit_hex_recurse
.hex_emit_remainder:
	pop	hl
	ld	a,l
	call	mz80_full_emit_hex_digit
	ret

mz80_full_emit_hex_digit:
	cp	#10
	jr	c,.hex_digit
	sub	#10
	ld	b,a
	ld	a,(mz80_full_hex_alpha)
	add	a,b
	jr	.hex_emit
.hex_digit:
	add	a,#48
.hex_emit:
	call	mz80_full_emit
	ret

; Pointer output is fixed-width hexadecimal. This avoids repeated subtraction
; over stack addresses while keeping %x/%X compact for ordinary values.
mz80_full_emit_hex_fixed:
	push	hl
	ld	a,h
	rrca
	rrca
	rrca
	rrca
	and	#15
	call	mz80_full_emit_hex_digit
	pop	hl
	push	hl
	ld	a,h
	and	#15
	call	mz80_full_emit_hex_digit
	pop	hl
	push	hl
	ld	a,l
	rrca
	rrca
	rrca
	rrca
	and	#15
	call	mz80_full_emit_hex_digit
	pop	hl
	ld	a,l
	and	#15
	call	mz80_full_emit_hex_digit
	ret

mz80_full_hex_alpha:
	.db	97
