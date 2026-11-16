; CP/M standalone lite runtime. Strings accepted by standard APIs are NUL-terminated.
	.module	cpm_lite
	.globl	main
	.globl	exit
	.globl	putchar
	.globl	getchar
	.globl	puts
	.globl	outstr
	.globl	mz80_cpm_outstr
	.globl	.gchar
	.globl	.gint
	.area	_CODE
START:
	call	main
	ld	hl,#0
	call	exit

getchar:
	ld	c,#1
	call	5
	ld	l,a
	ld	h,#0
	ret

putchar:
	ld	hl,#2
	add	hl,sp
	call	.gint
	ld	e,l
	ld	c,#2
	call	5
	ld	l,e
	ld	h,#0
	ret

; int puts(char *s): write NUL-terminated text followed by LF.
puts:
	ld	hl,#2
	add	hl,sp
	call	.gint
.puts_loop:
	ld	a,(hl)
	or	a
	jr	z,.puts_newline
	push	hl
	ld	e,a
	ld	c,#2
	call	5
	pop	hl
	inc	hl
	jr	.puts_loop
.puts_newline:
	ld	e,#10
	ld	c,#2
	call	5
	ld	hl,#0
	ret

; Legacy CP/M BDOS 9 API: '$'-terminated string.
outstr:
mz80_cpm_outstr:
	ld	hl,#2
	add	hl,sp
	call	.gint
	ex	de,hl
	ld	c,#9
	call	5
	ret

exit:
	ld	c,#0
	call	5
	ret

.gchar:
	ld	l,(hl)
	ld	h,#0
	ret
.gint:
	ld	a,(hl)
	inc	hl
	ld	h,(hl)
	ld	l,a
	ret
